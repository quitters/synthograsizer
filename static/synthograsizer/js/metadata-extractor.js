// metadata-extractor.js
// PNG metadata extraction for the Metadata Reader and bulk import: reads tEXt/iTXt/zTXt chunks and parses prompt/model info.
// Lives here, not in static/metadata-manager/, because that folder is gitignored and never reaches the live site.

// Utility: Parse PNG chunks (tEXt, iTXt, zTXt)
function parsePNGChunks(arrayBuffer) {
    const data = new DataView(arrayBuffer);
    let offset = 8; // skip PNG signature
    const chunks = [];
    while (offset < data.byteLength) {
        const length = data.getUint32(offset);
        const type = String.fromCharCode(
            data.getUint8(offset + 4),
            data.getUint8(offset + 5),
            data.getUint8(offset + 6),
            data.getUint8(offset + 7)
        );
        const chunkData = new Uint8Array(arrayBuffer, offset + 8, length);
        chunks.push({ type, data: chunkData });
        offset += 12 + length;
    }
    return chunks;
}

async function decompressZlib(uint8array) {
    if (typeof DecompressionStream !== 'undefined') {
        const stream = new Blob([uint8array]).stream().pipeThrough(new DecompressionStream('deflate'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
        throw new Error('DecompressionStream not supported in this browser');
    }
}

// Utility: Extract text metadata from PNG chunks (async to handle decompression)
async function extractTextChunks(chunks) {
    const text = {};
    for (const chunk of chunks) {
        if (chunk.type === 'tEXt') {
            const nul = chunk.data.indexOf(0);
            if (nul > 0) {
                const key = new TextDecoder().decode(chunk.data.slice(0, nul));
                const value = new TextDecoder().decode(chunk.data.slice(nul + 1));
                text[key] = value;
            }
        } else if (chunk.type === 'zTXt') {
            const nul = chunk.data.indexOf(0);
            if (nul > 0) {
                const key = new TextDecoder().decode(chunk.data.slice(0, nul));
                const compressedData = chunk.data.slice(nul + 2); // Skip null byte and compression method (usually 0)
                try {
                    const decompressed = await decompressZlib(compressedData);
                    text[key] = new TextDecoder().decode(decompressed);
                } catch (e) {
                    console.warn('Failed to decompress zTXt chunk for key:', key, e);
                    text[key] = `[Compressed data parsing failed: ${e.message}]`;
                }
            }
        } else if (chunk.type === 'iTXt') {
            const nul1 = chunk.data.indexOf(0);
            if (nul1 > 0) {
                const key = new TextDecoder().decode(chunk.data.slice(0, nul1));
                const compressionFlag = chunk.data[nul1 + 1];
                
                let offset = nul1 + 3; // skip null byte, compression flag, and compression method
                const nul2 = chunk.data.indexOf(0, offset); // Language tag null
                
                offset = nul2 + 1;
                const nul3 = chunk.data.indexOf(0, offset); // Translated keyword null
                
                offset = nul3 + 1;
                const textData = chunk.data.slice(offset);
                
                if (compressionFlag === 1) {
                    try {
                        const decompressed = await decompressZlib(textData);
                        text[key] = new TextDecoder('utf-8').decode(decompressed);
                    } catch (e) {
                        console.warn('Failed to decompress iTXt chunk for key:', key, e);
                        text[key] = `[Compressed data parsing failed: ${e.message}]`;
                    }
                } else {
                    text[key] = new TextDecoder('utf-8').decode(textData);
                }
            }
        }
    }

    // Add a _chunkSummary so we can see all chunks (including eXIf, pHYs, etc.)
    text['_chunkSummary'] = chunks.map(c => ({
        type: c.type,
        size: c.data.length
    }));

    return text;
}

// Helper: Parse ComfyUI workflow JSON to extract prompt, negative prompt, and parameters
function parseComfyUIWorkflow(workflowJson) {
    try {
        const workflow = typeof workflowJson === 'string' ? JSON.parse(workflowJson) : workflowJson;
        let prompt = '';
        let negativePrompt = '';
        let jobId = '';

        // Find all CLIPTextEncode nodes
        const textNodes = Object.values(workflow).filter(node => 
            node.class_type === 'CLIPTextEncode' && 
            node.inputs && typeof node.inputs.text === 'string'
        );

        // Find positive prompt
        const posNode = textNodes.find(node => 
            node._meta?.title?.endsWith('(Prompt)') || 
            node._meta?.title === 'Positive Prompt' ||
            (node._meta?.title && !node._meta.title.toLowerCase().includes('(negative)')) ||
            Object.values(workflow).some(n => n.inputs?.positive?.[0] === node.id)
        );
        if (posNode) prompt = posNode.inputs.text;
        else if (textNodes.length > 0) prompt = textNodes[0].inputs.text;

        // Find negative prompt
        const negNode = textNodes.find(node => 
            node._meta?.title?.toLowerCase().includes('(negative)') ||
            node._meta?.title === 'Negative Prompt' ||
            Object.values(workflow).some(n => n.inputs?.negative?.[0] === node.id)
        );
        if (negNode && negNode !== posNode) negativePrompt = negNode.inputs.text;

        if (!prompt && !negativePrompt) return null;

        const modelNode = Object.values(workflow).find(node => 
            node.class_type === 'KSampler' || 
            node.class_type?.includes('Sampler')
        );
        
        const params = [];
        if (modelNode) {
            if (modelNode.inputs?.steps) params.push(`steps: ${modelNode.inputs.steps}`);
            if (modelNode.inputs?.cfg) params.push(`cfg: ${modelNode.inputs.cfg}`);
            if (modelNode.inputs?.sampler_name) params.push(`sampler: ${modelNode.inputs.sampler_name}`);
            if (modelNode.inputs?.scheduler) params.push(`scheduler: ${modelNode.inputs.scheduler}`);
        }
        
        const model = Object.values(workflow).find(node => 
            node.class_type === 'UNETLoader' || 
            node.class_type === 'CheckpointLoaderSimple'
        )?.inputs?.ckpt_name || '';

        // Check for EmProps
        const saverNode = Object.values(workflow).find(node => node.class_type === 'EmProps_S3_Saver');
        if (saverNode && saverNode.inputs?.prefix) {
            const parts = saverNode.inputs.prefix.split('/');
            if (parts.length >= 2) {
                jobId = parts[parts.length - 2];
                params.push(`Job ID: ${jobId}`);
            }
        }
        
        return {
            prompt,
            negative_prompt: negativePrompt,
            parameters: params,
            model,
            isComfyUI: true
        };
    } catch (e) {
        console.error('Error parsing ComfyUI workflow:', e);
        return null;
    }
}

// Helper: Split a Midjourney-style prompt into main prompt and parameters
function splitPromptAndParameters(prompt) {
    if (!prompt) return { mainPrompt: '', parameters: [] };
    
    // Parameters start with --, are separated by spaces, and are always at the end
    const paramRegex = /\s(--[\w-]+(?: [^\s-][^\s]*)*)/g;
    const match = prompt.match(paramRegex);
    let mainPrompt = prompt;
    let parameters = [];
    
    if (match) {
        // Find where the parameters start
        const firstParamIndex = prompt.indexOf(match[0]);
        mainPrompt = prompt.substring(0, firstParamIndex).trim();
        
        // Split parameters by --, filter out empty
        const rawParams = prompt.substring(firstParamIndex).split(/\s--/)
            .map(s => s.trim())
            .filter(Boolean)
            .map(s => (s.startsWith('--') ? s : '--' + s));
        
        // Parameter mapping object for all Midjourney parameters
        const parameterMap = {
            // Common parameters
            'ar': 'Aspect Ratio',
            'aspect': 'Aspect Ratio',
            'c': 'Chaos',
            'chaos': 'Chaos',
            'cref': 'Character Reference',
            'no': 'Negative Prompt',
            'p': 'Profile',
            'profile': 'Profile',
            'q': 'Quality',
            'quality': 'Quality',
            'r': 'Repeat',
            'repeat': 'Repeat',
            'seed': 'Seed',
            'stop': 'Stop',
            'raw': 'Raw Mode',
            's': 'Stylize',
            'stylize': 'Stylize',
            'sref': 'Style Reference',
            'tile': 'Tile',
            'v': 'Version',
            'version': 'Version',
            'draft': 'Draft Mode',
            'w': 'Weird',
            'weird': 'Weird',
            'fast': 'Fast Mode',
            'iw': 'Image Weight',
            'relax': 'Relax Mode',
            'turbo': 'Turbo Mode',
            'niji': 'Niji Model',
            'stealth': 'Stealth Mode',
            'public': 'Public Mode'
        };
        
        // Process each parameter
        rawParams.forEach(param => {
            // Remove leading -- and split by first space
            const cleanParam = param.startsWith('--') ? param.substring(2) : param;
            const parts = cleanParam.split(' ');
            const paramName = parts[0];
            const paramValue = parts.slice(1).join(' ');
            
            // Get the formatted parameter name
            const formattedName = parameterMap[paramName] || 
                               (paramName.charAt(0).toUpperCase() + paramName.slice(1));
            
            let result;
            
            // Special formatting for specific parameters
            if (paramName === 'ar' || paramName === 'aspect') {
                // Format aspect ratio as W:H
                if (paramValue.includes(':')) {
                    result = { name: formattedName, value: paramValue };
                } else {
                    const ratio = parseFloat(paramValue);
                    if (!isNaN(ratio)) {
                        if (ratio > 1) {
                            result = { name: formattedName, value: `${ratio}:1` };
                        } else {
                            // Convert to fraction with two decimal places
                            const inverseRatio = Math.round((1/ratio) * 100) / 100;
                            result = { name: formattedName, value: `1:${inverseRatio}` };
                        }
                    }
                }
            } 
            // Boolean parameters without values
            else if (['raw', 'tile', 'draft', 'fast', 'relax', 'turbo', 'niji', 'stealth', 'public'].includes(paramName) && !paramValue) {
                result = { name: formattedName, value: 'Yes' };
            }
            // Image weight parameter
            else if (paramName === 'iw') {
                result = { name: formattedName, value: paramValue || '1' };
            }
            // Job ID (separate from version)
            else if (paramName === 'v' || paramName === 'version') {
                // Check if the value contains a Job ID (typically looks like a UUID or contains 'Job ID')
                const jobIDRegex = /(Job\s*ID:?)?\s*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;
                const jobIDMatch = paramValue.match(jobIDRegex);
                
                if (jobIDMatch) {
                    // Extract version number (everything before the Job ID)
                    const versionNumber = paramValue.substring(0, paramValue.indexOf(jobIDMatch[0])).trim();
                    // Add version parameter
                    parameters.push({ name: formattedName, value: versionNumber });
                    // Add Job ID parameter (using the UUID part from regex match)
                    parameters.push({ name: 'Job ID', value: jobIDMatch[2] });
                    return; // Skip the normal parameter addition
                } else {
                    // Simple version number without Job ID
                    result = { name: formattedName, value: paramValue };
                }
            }
            // Default case
            else {
                result = { name: formattedName, value: paramValue || '—' };
            }
            
            // Add the processed parameter if it exists
            if (result) {
                parameters.push(result);
            }
        });
    }
    
    return { mainPrompt, parameters };
}

// Helper: Split a prompt into individual components (multiprompts for MJ, commas for SD)
function splitMultiprompt(prompt, source = 'midjourney') {
    if (!prompt) return [];
    
    if (source === 'midjourney') {
        // Midjourney multiprompts use :: as separator
        // We split by :: followed by optional weights, but keep the text
        const parts = prompt.split(/::\s*-?[\d.]*\s*/);
        return parts.map(p => p.trim()).filter(Boolean);
    } else if (source === 'stablediffusion' || source === 'comfyui') {
        // Stable Diffusion/ComfyUI prompts are often comma-separated tag lists
        const parts = prompt.split(',');
        return parts.map(p => p.trim()).filter(p => p.length > 2); // Only meaningful tags
    }
    
    return [prompt.trim()];
}

// Helper: Parse XMP metadata (used by DALL-E 3 and others)
function parseXMP(xmpString) {
    if (!xmpString) return null;
    
    // Extract description (common in DALL-E 3)
    // Format: <dc:description><rdf:Alt><rdf:li xml:lang="x-default">PROMPT HERE</rdf:li></rdf:Alt></dc:description>
    const dcDesc = xmpString.match(/<dc:description>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/i);
    if (dcDesc) return dcDesc[1].trim();
    
    // Extract headline
    const headline = xmpString.match(/<photoshop:Headline>([\s\S]*?)<\/photoshop:Headline>/i);
    if (headline) return headline[1].trim();
    
    // Extract user comment
    const userComment = xmpString.match(/<exif:UserComment>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/i);
    if (userComment) return userComment[1].trim();

    return null;
}

// Main: Extract AI image metadata (prompt, model, etc.)
async function extractAIMetadataFromPNG(arrayBuffer) {
    const chunks = parsePNGChunks(arrayBuffer);
    const textChunks = await extractTextChunks(chunks);
    
    // Check for ComfyUI workflow first
    if (textChunks['prompt'] && textChunks['workflow']) {
        try {
            const comfyData = parseComfyUIWorkflow(textChunks['prompt']);
            if (comfyData) {
                return {
                    ...comfyData,
                    author: textChunks['Author'] || '',
                    width: textChunks['Width'] || '',
                    height: textChunks['Height'] || '',
                    raw: textChunks,
                    source: 'comfyui'
                };
            }
        } catch (e) {
            console.error('Error processing ComfyUI metadata:', e);
        }
    }
    
    // Handle Midjourney/Stable Diffusion/DALL-E
    let prompt = textChunks['parameters'] || textChunks['Description'] || '';
    let model = textChunks['Source'] || textChunks['model'] || textChunks['Model'] || '';
    let author = textChunks['Author'] || textChunks['author'] || '';
    let width = textChunks['Width'] || '';
    let height = textChunks['Height'] || '';
    let negativePrompt = '';
    
    // Check for XMP metadata (DALL-E 3, Adobe, etc.)
    const xmpKey = Object.keys(textChunks).find(k => k.toLowerCase().includes('xmp'));
    if (xmpKey) {
        const xmpPrompt = parseXMP(textChunks[xmpKey]);
        if (xmpPrompt && !prompt) {
            prompt = xmpPrompt;
            if (textChunks[xmpKey].includes('dalle')) source = 'dalle';
        }
    }

    let mainPrompt = prompt;
    let parameters = [];
    let source = 'unknown';

    // Check for Stable Diffusion A1111 format
    if (prompt && prompt.includes('Steps:') && prompt.includes('Sampler:')) {
        source = 'stablediffusion';
        let parts = prompt.split('Negative prompt:');
        if (parts.length > 1) {
            mainPrompt = parts[0].trim();
            let remaining = parts[1];
            let stepsIndex = remaining.indexOf('Steps:');
            if (stepsIndex !== -1) {
                negativePrompt = remaining.substring(0, stepsIndex).trim();
                let paramsStr = remaining.substring(stepsIndex);
                let paramsArray = paramsStr.split(',').map(s => s.trim());
                for (let p of paramsArray) {
                    let kv = p.split(':');
                    if (kv.length >= 2) {
                        parameters.push({ name: kv[0].trim(), value: kv.slice(1).join(':').trim() });
                    }
                }
            } else {
                negativePrompt = remaining.trim();
            }
        } else {
            let stepsIndex = prompt.indexOf('Steps:');
            if (stepsIndex !== -1) {
                mainPrompt = prompt.substring(0, stepsIndex).trim();
                let paramsStr = prompt.substring(stepsIndex);
                let paramsArray = paramsStr.split(',').map(s => s.trim());
                for (let p of paramsArray) {
                    let kv = p.split(':');
                    if (kv.length >= 2) {
                        parameters.push({ name: kv[0].trim(), value: kv.slice(1).join(':').trim() });
                    }
                }
            }
        }
        
        if (!model) {
            let modelParam = parameters.find(p => p.name === 'Model');
            if (modelParam) model = modelParam.value;
        }
    } 
    // Midjourney and Unknown fallbacks
    else {
        if (!prompt) {
            source = 'none';
        } else if (/--[\w-]/.test(prompt) || textChunks['Author'] === 'Midjourney' || textChunks['Source'] === 'Midjourney') {
            source = 'midjourney';
            const split = splitPromptAndParameters(prompt);
            mainPrompt = split.mainPrompt;
            parameters = split.parameters;
        } else {
            source = 'unknown';
        }
    }
    
    return {
        prompt: mainPrompt,
        negative_prompt: negativePrompt,
        parameters,
        model,
        author,
        width,
        height,
        raw: textChunks,
        source
    };
}

// Export for use in Prompt Metadata Manager (works in both Window and Worker environments)
globalThis.extractAIMetadataFromPNG = extractAIMetadataFromPNG;
globalThis.splitMultiprompt = splitMultiprompt;
