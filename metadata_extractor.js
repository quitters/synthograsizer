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

// Helper: Split a Midjourney-style prompt into main prompt and parameters
function splitPromptAndParameters(prompt) {
    // Parameters start with --, are separated by spaces, and are always at the end
    // Example: "the cutest puppy ever --ar 2:3 --v 7"
    // We'll capture the main prompt and all parameters
    const paramRegex = /\s(--[\w-]+(?: [^\s-][^\s]*)*)/g;
    const match = prompt.match(paramRegex);
    let mainPrompt = prompt;
    let parameters = [];
    if (match) {
        // Find where the parameters start
        const firstParamIndex = prompt.indexOf(match[0]);
        mainPrompt = prompt.substring(0, firstParamIndex).trim();
        // Split parameters by --, filter out empty
        parameters = prompt.substring(firstParamIndex).split(/\s--/)
            .map(s => s.trim())
            .filter(Boolean)
            .map(s => (s.startsWith('--') ? s : '--' + s));
    }
    return { mainPrompt, parameters };
}

// Main: Extract AI image metadata (prompt, model, etc.)
function extractAIMetadataFromPNG(arrayBuffer) {
    const chunks = parsePNGChunks(arrayBuffer);
    const textChunks = extractTextChunks(chunks);
    // Example: Stable Diffusion WebUI uses 'parameters', Midjourney uses 'Description', etc.
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
        raw: textChunks
    };
}

// Export for use in Prompt Metadata Manager
window.extractAIMetadataFromPNG = extractAIMetadataFromPNG;
