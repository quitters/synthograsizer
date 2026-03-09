// New Image Analysis Functions with Auto-Generate and Batch Support

async function runImageAnalysis_NEW() {
    const batchMode = document.getElementById('analysis-batch-toggle')?.checked;

    if (batchMode) {
        await this.runBatchAnalysis();
    } else {
        await this.runSingleAnalysis();
    }
}

async function runSingleAnalysis_NEW() {
    const input = document.getElementById('analysis-input-image');
    const resultBox = document.getElementById('analysis-result-box');
    const resultText = document.getElementById('analysis-result-text');
    const autoGenerate = document.getElementById('analysis-auto-generate')?.checked;

    if (!input.files.length) {
        showToast("Please select an image to analyze.", 'warning');
        return;
    }

    const btn = document.getElementById('run-image-analysis');
    const originalText = btn.innerText;
    btn.innerText = "Analyzing...";
    btn.disabled = true;
    resultBox.style.display = 'none';

    try {
        const imageB64 = await this.readFileAsBase64(input.files[0]);

        const res = await fetch('/api/analyze/image-to-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: imageB64,
                auto_generate: autoGenerate
            })
        });

        if (!res.ok) throw new Error((await res.json()).detail);

        const data = await res.json();

        resultText.textContent = data.analysis;
        resultBox.style.display = 'block';

        // Display auto-generated image if available
        if (data.generated_image) {
            const imgContainer = document.createElement('div');
            imgContainer.style.cssText = 'margin-top:15px; padding:10px; background:#f5f5f5; border-radius:6px;';
            imgContainer.innerHTML = `
                <div style="margin-bottom:8px; font-weight:600;">Auto-Generated Image</div>
                <div style="font-size:12px; color:#666; margin-bottom:8px;">
                    Aspect Ratio: ${data.detected_aspect_ratio} (Original: ${data.original_dimensions})
                </div>
                <img src="${data.generated_image}" style="max-width:100%; border-radius:4px; cursor:pointer;" 
                     onclick="window.studioIntegration.openLightbox(0)" data-lightbox-src="${data.generated_image}">
            `;
            resultBox.appendChild(imgContainer);
        }

        // Handle Auto-Template Generation
        const autoTemplate = document.getElementById('analysis-auto-template').checked;
        if (autoTemplate) {
            btn.innerText = "Generating Template...";

            const tmplRes = await fetch('/api/generate/template-from-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ analysis: data.analysis })
            });

            if (!tmplRes.ok) throw new Error("Template Gen Failed: " + (await tmplRes.json()).detail);

            const tmplData = await tmplRes.json();
            const template = tmplData.template;

            // Import into Synthograsizer
            if (this.app && this.app.loadTemplate) {
                const success = this.app.loadTemplate(template);
                if (success) {
                    this.closeAllModals();
                } else {
                    showToast("Template generated but failed to load.", 'error');
                }
            }
        }

    } catch (e) {
        showToast("Analysis failed: " + e.message, 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

async function runBatchAnalysis_NEW() {
    const folderInput = document.getElementById('analysis-batch-folder');
    const autoGenerate = document.getElementById('analysis-auto-generate')?.checked;

    if (!folderInput.files.length) {
        showToast("Please select a folder of images.", 'warning');
        return;
    }

    const images = Array.from(folderInput.files).filter(f => f.type.startsWith('image/'));

    if (images.length === 0) {
        showToast("No images found in selected folder.", 'warning');
        return;
    }

    this.closeAllModals();
    this.showLoading(`Batch Analysis (${images.length} images)`);

    try {
        // Convert all images to base64
        const imagePromises = images.map(img => this.readFileAsBase64(img));
        const imagesB64 = await Promise.all(imagePromises);

        // Call batch endpoint
        const res = await fetch('/api/analyze/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                images: imagesB64,
                auto_generate: autoGenerate
            })
        });

        if (!res.ok) throw new Error((await res.json()).detail);

        const data = await res.json();

        // Display results in grid
        const content = document.getElementById('studio-content');
        content.innerHTML = `
            <div style="margin-bottom:20px;">
                <h3>Batch Analysis Complete</h3>
                <p>${data.total} images processed</p>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:20px;">
                ${data.results.map((result, idx) => `
                    <div style="border:1px solid #ddd; border-radius:8px; padding:15px; background:white;">
                        <div style="font-weight:600; margin-bottom:10px;">Image ${idx + 1}</div>
                        ${result.status === 'success' ? `
                            <div style="margin-bottom:10px;">
                                <strong>Analysis:</strong>
                                <div style="font-size:13px; color:#555; max-height:150px; overflow-y:auto; padding:8px; background:#f9f9f9; border-radius:4px; margin-top:4px;">
                                    ${this.escapeHtml(result.analysis)}
                                </div>
                            </div>
                            ${result.generated_image ? `
                                <div>
                                    <strong>Generated (${result.aspect_ratio}):</strong>
                                    <img src="${result.generated_image}" 
                                         style="width:100%; border-radius:4px; margin-top:8px; cursor:pointer;"
                                         onclick="window.studioIntegration.openLightbox(${idx})"
                                         data-lightbox-src="${result.generated_image}">
                                </div>
                            ` : ''}
                        ` : `
                            <div style="color:#d32f2f;">Error: ${this.escapeHtml(result.error)}</div>
                        `}
                    </div>
                `).join('')}
            </div>
        `;

        document.getElementById('studio-result').classList.add('active');

    } catch (e) {
        this.showError("Batch analysis failed: " + e.message);
    }
}
