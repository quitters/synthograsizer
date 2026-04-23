import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import { synthClient } from 'workflow-engine';

const IMAGE_MODEL = 'gemini-3-pro-image-preview';

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
  genAI = new GoogleGenerativeAI(apiKey);
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

  const model = genAI.getGenerativeModel({
    model: IMAGE_MODEL,
    generationConfig: {
      temperature: 1.0,
    },
  });

  try {
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: imageData
            }
          },
          { text: prompt }
        ]
      }]
    });

    return result.response.text();
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
  ];

  let cleaned = text;
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned.trim();
}

/**
 * Generate an image using reference images for style/content guidance
 * @param {string} prompt - The generation prompt
 * @param {Array<{imageData: string, mimeType: string}>} referenceImages - Reference images
 * @param {Object} options - Generation options
 * @returns {Promise<{imageData: string, mimeType: string, text?: string}>}
 */
export async function generateImageWithReferences(prompt, referenceImages = [], options = {}) {
  try {
    // Collect reference image data into Array<string>
    const imageList = referenceImages.map(r => r.imageData);
    // Use synthClient which routes to the fastAPI backend and embeds metadata cleanly
    const result = await synthClient._post('/api/generate/image', {
      prompt,
      model: 'gemini-3-pro-image-preview',
      input_images: imageList,
      temperature: options.temperature || 1.0,
      top_p: options.topP || 0.95
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
