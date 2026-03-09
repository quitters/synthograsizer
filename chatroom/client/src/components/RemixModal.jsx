import React, { useState } from 'react';

const API_BASE = '/chatroom/api';

export function RemixModal({ referenceImage, onClose, onImageGenerated }) {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/chat/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          referenceIds: [referenceImage.id]
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate image');
      }

      setGeneratedImage(data.image);

      if (onImageGenerated) {
        onImageGenerated(data.image);
      }
    } catch (err) {
      console.error('Image generation failed:', err);
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedImage) return;

    const link = document.createElement('a');
    link.href = `data:${generatedImage.mimeType};base64,${generatedImage.imageData}`;
    link.download = `remix_${generatedImage.id}.png`;
    link.click();
  };

  const handleGenerateAnother = () => {
    setGeneratedImage(null);
    setPrompt('');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal remix-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>&times;</button>

        <h3>🎨 Remix / Iterate Image</h3>

        <div className="remix-content">
          {/* Reference Image */}
          <div className="remix-reference">
            <label>Reference Image</label>
            <div className="reference-image-container">
              <img
                src={`data:${referenceImage.mimeType};base64,${referenceImage.imageData}`}
                alt="Reference"
                className="reference-image"
              />
            </div>
            <div className="reference-prompt">
              <strong>Original prompt:</strong>
              <p>{referenceImage.prompt || referenceImage.caption || 'No prompt available'}</p>
            </div>
          </div>

          {/* Generation Input */}
          {!generatedImage ? (
            <div className="remix-input">
              <label>New Prompt</label>
              <textarea
                placeholder="Describe the changes or variations you want...

Examples:
• Same character but in a different pose
• Change the background to a forest
• Make it more colorful and vibrant
• Add dramatic lighting effects"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                disabled={isGenerating}
              />

              {error && (
                <div className="remix-error">{error}</div>
              )}

              <div className="remix-actions">
                <button
                  className="btn btn-secondary"
                  onClick={onClose}
                  disabled={isGenerating}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleGenerate}
                  disabled={isGenerating || !prompt.trim()}
                >
                  {isGenerating ? (
                    <>
                      <span className="spinner"></span>
                      Generating...
                    </>
                  ) : (
                    '🎨 Generate Remix'
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Generated Result */
            <div className="remix-result">
              <label>Generated Image</label>
              <div className="generated-image-container">
                <img
                  src={`data:${generatedImage.mimeType};base64,${generatedImage.imageData}`}
                  alt="Generated"
                  className="generated-image"
                />
              </div>
              <div className="generated-prompt">
                <strong>Prompt used:</strong>
                <p>{prompt}</p>
              </div>

              <div className="remix-actions">
                <button
                  className="btn btn-secondary"
                  onClick={handleGenerateAnother}
                >
                  Generate Another
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleDownload}
                >
                  ⬇️ Download
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={onClose}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
