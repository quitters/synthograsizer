// metadata_extractor.js
// PNG metadata extraction for Prompt Metadata Manager
// Reads tEXt/iTXt chunks and parses prompt/model info similar to Python version

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

// Utility: Extract text metadata from PNG chunks
function extractTextChunks(chunks) {
    const text = {};
    for (const chunk of chunks) {
        if (chunk.type === 'tEXt' || chunk.type === 'iTXt') {
            // tEXt: key\0value
            const nul = chunk.data.indexOf(0);
            if (nul > 0) {
                const key = new TextDecoder().decode(chunk.data.slice(0, nul));
                const value = new TextDecoder().decode(chunk.data.slice(nul + 1));
                text[key] = value;
            }
        }
    }
    return text;
}

// Helper: Parse ComfyUI workflow JSON to extract prompt and parameters
function parseComfyUIWorkflow(workflowJson) {
    try {
        const workflow = typeof workflowJson === 'string' ? JSON.parse(workflowJson) : workflowJson;
        const promptNode = Object.values(workflow).find(node => 
            node._meta?.title === 'Positive Prompt' || 
            (node.inputs?.text && Object.values(workflow).some(n => 
                n.inputs?.positive?.[0] === node.id
            ))
        );
        
        if (!promptNode) return null;
        
        const prompt = promptNode.inputs?.text || '';
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
        
        return {
            prompt,
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

// Main: Extract AI image metadata (prompt, model, etc.)
function extractAIMetadataFromPNG(arrayBuffer) {
    const chunks = parsePNGChunks(arrayBuffer);
    const textChunks = extractTextChunks(chunks);
    
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
    
    // Handle Midjourney/Stable Diffusion
    let prompt = textChunks['parameters'] || textChunks['Description'] || '';
    let model = textChunks['Source'] || textChunks['model'] || textChunks['Model'] || '';
    let author = textChunks['Author'] || textChunks['author'] || '';
    let width = textChunks['Width'] || '';
    let height = textChunks['Height'] || '';
    
    // Split prompt/parameters for Midjourney-style prompts
    let mainPrompt = prompt;
    let parameters = [];
    if (prompt && /--[\w-]/.test(prompt)) {
        const split = splitPromptAndParameters(prompt);
        mainPrompt = split.mainPrompt;
        parameters = split.parameters;
    }
    
    return {
        prompt: mainPrompt,
        parameters,
        model,
        author,
        width,
        height,
        raw: textChunks,
        source: 'midjourney'
    };
}

// Export for use in Prompt Metadata Manager
window.extractAIMetadataFromPNG = extractAIMetadataFromPNG;
