async runBulkMetadataImport() {
    const folderInput = document.getElementById('metadata-folder-input');
    const runBtn = document.getElementById('run-bulk-metadata-import');
    const progressArea = document.getElementById('bulk-import-progress');
    const progressBar = document.getElementById('bulk-import-progress-bar');
    const statusText = document.getElementById('bulk-import-status');
    const logArea = document.getElementById('bulk-import-log');

    if (!folderInput.files || folderInput.files.length === 0) {
        showToast('Please select a folder first.', 'warning');
        return;
    }

    // Filter for PNG files only
    const pngFiles = Array.from(folderInput.files).filter(file => 
        file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
    );

    if (pngFiles.length === 0) {
        showToast('No PNG files found in the selected folder.', 'warning');
        return;
    }

    const originalText = runBtn.textContent;
    runBtn.textContent = 'Processing...';
    runBtn.disabled = true;
    progressArea.style.display = 'block';
    progressBar.style.width = '0%';
    logArea.value = `Found ${pngFiles.length} PNG file(s). Starting import...\n\n`;

    const BATCH_SIZE = 20; // Process 20 images at a time
    let totalSuccessCount = 0;
    let totalErrorCount = 0;
    const allExtractedPrompts = [];

    try {
        const totalBatches = Math.ceil(pngFiles.length / BATCH_SIZE);
        
        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const startIdx = batchIndex * BATCH_SIZE;
            const endIdx = Math.min(startIdx + BATCH_SIZE, pngFiles.length);
            const batchFiles = pngFiles.slice(startIdx, endIdx);
            
            statusText.textContent = `Processing batch ${batchIndex + 1}/${totalBatches} (${startIdx + 1}-${endIdx} of ${pngFiles.length})`;
            
            for (let i = 0; i < batchFiles.length; i++) {
                const file = batchFiles[i];
                const fileName = file.name;
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const meta = await window.extractAIMetadataFromPNG(arrayBuffer);
                    
                    if (meta.prompt) {
                        totalSuccessCount++;
                        const trimmedPrompt = meta.prompt.trim();
                        if (trimmedPrompt) {
                            allExtractedPrompts.push(trimmedPrompt);
                            logArea.value += `✓ ${fileName}: Prompt extracted\n`;
                        } else {
                            logArea.value += `⚠ ${fileName}: Prompt was empty after trimming\n`;
                        }
                    } else {
                        logArea.value += `⚠ ${fileName}: No prompt found in metadata\n`;
                    }
                } catch (err) {
                    totalErrorCount++;
                    logArea.value += `✗ ${fileName}: ${err.message || 'Unknown error'}\n`;
                }

                // Update progress
                const overallProgress = ((startIdx + i + 1) / pngFiles.length) * 100;
                progressBar.style.width = `${overallProgress}%`;
                
                // Yield to keep UI responsive
                await new Promise(r => setTimeout(r, 0));
            }
            
            // Scroll log to bottom
            logArea.scrollTop = logArea.scrollHeight;
        }

        // Add prompts to liked prompts list
        if (allExtractedPrompts.length > 0 && this.app && this.app.likedPrompts) {
            const beforeCount = this.app.likedPrompts.length;
            
            // Add unique prompts only (prompts are already trimmed)
            for (const prompt of allExtractedPrompts) {
                if (!this.app.likedPrompts.includes(prompt)) {
                    this.app.likedPrompts.push(prompt);
                }
            }
            
            const addedCount = this.app.likedPrompts.length - beforeCount;
            
            // Update the favorites textarea if it exists
            if (this.app.elements && this.app.elements.favoritesTextarea) {
                this.app.elements.favoritesTextarea.value = this.app.likedPrompts.join('\n');
            }
            
            // Save to storage
            this.app.saveStateToStorage();
            
            logArea.value += `\n✓ Successfully added ${addedCount} unique prompt(s) to liked prompts!\n`;
            statusText.textContent = `Complete: ${totalSuccessCount} extracted, ${addedCount} added`;
        } else if (allExtractedPrompts.length > 0) {
            logArea.value += `\n⚠ Warning: Could not access liked prompts list. Please ensure the main app is loaded.\n`;
            statusText.textContent = `Complete: ${totalSuccessCount} extracted (not added)`;
        } else {
            logArea.value += `\n⚠ No prompts were extracted from the images.\n`;
            statusText.textContent = 'Complete: No prompts found';
        }

        progressBar.style.width = '100%';
        
        if (totalErrorCount > 0) {
            logArea.value += `\n${totalErrorCount} file(s) had errors.\n`;
        }
        
        // Scroll to bottom
        logArea.scrollTop = logArea.scrollHeight;
        
    } catch (error) {
        console.error('Bulk import error:', error);
        logArea.value += `\n✗ Error: ${error.message}\n`;
        statusText.textContent = 'Failed';
    } finally {
        runBtn.textContent = originalText;
        runBtn.disabled = false;
    }
}
