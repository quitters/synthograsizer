import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { synthClient } from 'workflow-engine';
import { buildReferencePayload } from './imageReferences.js';

const IMAGE_MODEL = 'gemini-3-pro-image';

/**
 * Ensure image data is PNG regardless of what Gemini returned.
 * Gemini often returns image/jpeg even when PNG would be more appropriate.
 * PNG preserves metadata, supports lossless quality, and is required by
 * several downstream tools (smart-transform, analyze, etc).
 *
 * @param {string} base64Data - base64 image data (no data URI prefix)
 * @param {string} mimeType   - MIME type from the API response
 * @returns {Promise<{data: string, mimeType: string}>}
 */
async function normalizeImageToPng(base64Data, mimeType) {
  if (mimeType === 'image/png') return { data: base64Data, mimeType: 'image/png' };
  try {
    const inputBuffer = Buffer.from(base64Data, 'base64');
    const pngBuffer = await sharp(inputBuffer).png().toBuffer();
    return { data: pngBuffer.toString('base64'), mimeType: 'image/png' };
  } catch (err) {
    console.warn('normalizeImageToPng: conversion failed, returning original:', err.message);
    return { data: base64Data, mimeType };
  }
}

let genAI = null;

export function initializeImageGen(apiKey) {
  genAI = new GoogleGenAI({ apiKey });
}

/**
 * Generate an image based on a prompt
 * @param {string} prompt - The image generation prompt
 * @param {Object} options - Generation options
 * @returns {Promise<{imageData: string, mimeType: string, text?: string}>}
 */
export async function generateImage(prompt, options = {}) {
  try {
    const result = await synthClient.generateImage(prompt, options);
    let imageData = result.image || result.imageData;
    if (!imageData) {
      throw new Error('No image generated');
    }
    return { imageData, mimeType: 'image/png', text: result.text };
  } catch (error) {
    console.error('Image generation error:', error);
    throw error;
  }
}

/**
 * Generate content with image input (for agents to "see" images)
 * @param {string} prompt - The prompt/question about the image
 * @param {string} imageData - Base64 encoded image data
 * @param {string} mimeType - Image MIME type
 * @returns {Promise<string>} - Text response about the image
 */
export async function analyzeImage(prompt, imageData, mimeType) {
  if (!genAI) {
    throw new Error('Image generation not initialized');
  }

  try {
    const interaction = await genAI.interactions.create({
      model: IMAGE_MODEL,
      generation_config: { temperature: 1.0 },
      input: [
        { type: 'image', data: imageData, mime_type: mimeType },
        { type: 'text', text: prompt },
      ],
      store: false,
    });

    return interaction.output_text || '';
  } catch (error) {
    console.error('Image analysis error:', error);
    throw error;
  }
}

/**
 * Edit an existing image based on instructions
 * @param {string} imageData - Base64 encoded image data
 * @param {string} mimeType - Image MIME type
 * @param {string} editPrompt - Instructions for editing
 * @returns {Promise<{imageData: string, mimeType: string, text?: string}>}
 */
export async function editImage(imageData, mimeType, editPrompt) {
  try {
    // Smart transform acts as an edit function via backend
    const result = await synthClient.smartTransform(imageData, editPrompt);
    let newImageData = result.image || result.imageData;
    if (!newImageData) {
      throw new Error('No image generated from edit');
    }
    return { imageData: newImageData, mimeType: 'image/png', text: result.prompt };
  } catch (error) {
    console.error('Image edit error:', error);
    throw error;
  }
}

/**
 * Parse an agent's response for image generation requests
 * Looks for special tags like [GENERATE_IMAGE: prompt] or [IMAGE: prompt]
 * Uses [\s\S]+? instead of .+? to match prompts that span multiple lines
 */
export function parseImageRequests(text) {
  const imagePatterns = [
    /\[GENERATE_IMAGE:\s*([\s\S]+?)\]/gi,
    /\[IMAGE:\s*([\s\S]+?)\]/gi,
    /\[CREATE_IMAGE:\s*([\s\S]+?)\]/gi,
    /\[VISUALIZE:\s*([\s\S]+?)\]/gi,
  ];

  const requests = [];
  const seen = new Set(); // Deduplicate across patterns

  for (const pattern of imagePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const prompt = match[1].trim().replace(/\s*\n\s*/g, ' '); // Collapse newlines to spaces
      if (!seen.has(prompt)) {
        seen.add(prompt);
        requests.push({
          fullMatch: match[0],
          prompt
        });
      }
    }
  }

  return requests;
}

/**
 * Remove image request tags from text
 * Uses [\s\S]+? to match tags that span multiple lines
 */
export function stripImageTags(text) {
  const patterns = [
    /\[GENERATE_IMAGE:\s*[\s\S]+?\]/gi,
    /\[IMAGE:\s*[\s\S]+?\]/gi,
    /\[CREATE_IMAGE:\s*[\s\S]+?\]/gi,
    /\[VISUALIZE:\s*[\s\S]+?\]/gi,
    /\[REMIX:\s*[\s\S]+?\]/gi,
    /\[ITERATE:\s*[\s\S]+?\]/gi,
    /\[VARIATION:\s*[\s\S]+?\]/gi,
    /\[COMPOSE_FROM:\s*[\s\S]+?\]/gi,
    /\[INCLUDE_IMAGE:\s*[\s\S]+?\]/gi,
  ];

  let cleaned = text;
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned.trim();
}

/**
 * Generate an image using reference images for style/content guidance.
 *
 * References may be untyped (the historical shape) or carry a `role` of
 * 'object' | 'character' | 'style', which routes them into the model's typed
 * composition slots. Character references are the ones worth reaching for on a
 * storyboard — they hold a recurring character steady across beats.
 *
 * @param {string} prompt - The generation prompt
 * @param {Array<{imageData: string, mimeType?: string, role?: string}>} referenceImages
 * @param {{model?: string, aspect_ratio?: string}} options - Generation options
 * @returns {Promise<{imageData: string, mimeType: string, text?: string}>}
 */
export async function generateImageWithReferences(prompt, referenceImages = [], options = {}) {
  try {
    // Typed slots need a model that has them; untyped references work anywhere.
    const defaultModel = referenceImages.some(r => r && r.role)
      ? 'gemini-3.1-flash-image'
      : 'gemini-3-pro-image';
    // Use synthClient which routes to the fastAPI backend and embeds metadata cleanly
    const result = await synthClient._post('/api/generate/image', {
      prompt,
      model: options.model || defaultModel,
      ...(options.aspect_ratio ? { aspect_ratio: options.aspect_ratio } : {}),
      ...buildReferencePayload(referenceImages)
      // No temperature / top_p: deprecated from Gemini 3.6 Flash onwards, and
      // the backend drops them on the floor rather than sending them on.
    });

    let imageData = result.image || result.imageData;
    if (!imageData) {
      throw new Error('No image generated');
    }
    return { imageData, mimeType: 'image/png', text: result.text };
  } catch (error) {
    console.error('Image generation with references error:', error);
    throw error;
  }
}

/**
 * Parse remix/iterate requests that reference previous images
 * Looks for [REMIX: imageId | prompt] or [ITERATE: imageId | prompt]
 * Uses [\s\S]+? to match prompts that span multiple lines
 */
export function parseRemixRequests(text) {
  const remixPatterns = [
    /\[REMIX:\s*([a-f0-9-]+)\s*\|\s*([\s\S]+?)\]/gi,
    /\[ITERATE:\s*([a-f0-9-]+)\s*\|\s*([\s\S]+?)\]/gi,
    /\[VARIATION:\s*([a-f0-9-]+)\s*\|\s*([\s\S]+?)\]/gi,
    /\[COMPOSE_FROM:\s*([a-f0-9-]+)\s*\|\s*([\s\S]+?)\]/gi,
    /\[INCLUDE_IMAGE:\s*([a-f0-9-]+)\s*\|\s*([\s\S]+?)\]/gi,
  ];

  const requests = [];

  for (const pattern of remixPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      requests.push({
        fullMatch: match[0],
        referenceImageId: match[1].trim(),
        prompt: match[2].trim().replace(/\s*\n\s*/g, ' ') // Collapse newlines to spaces
      });
    }
  }

  return requests;
}
