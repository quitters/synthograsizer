import React, { useState, useRef } from 'react';

const API_BASE = '/chatroom/api';

export function AgentAvatarEditor({ agent, onAvatarChange, onClose }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [previewUrl, setPreviewUrl] = useState(agent.avatar || null);
  const [activeTab, setActiveTab] = useState('generate'); // 'generate' or 'upload'
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Generate default prompt based on agent bio
  const getDefaultPrompt = () => {
    const name = agent.name;
    const bioSnippet = agent.bio?.slice(0, 200) || '';

    // Extract key descriptors from bio
    const descriptors = [];
    if (bioSnippet.toLowerCase().includes('ceo') || bioSnippet.toLowerCase().includes('executive')) {
      descriptors.push('professional business executive');
    }
    if (bioSnippet.toLowerCase().includes('creative') || bioSnippet.toLowerCase().includes('artist')) {
      descriptors.push('creative artistic personality');
    }
    if (bioSnippet.toLowerCase().includes('scientist') || bioSnippet.toLowerCase().includes('researcher')) {
      descriptors.push('intellectual scientist');
    }
    if (bioSnippet.toLowerCase().includes('engineer') || bioSnippet.toLowerCase().includes('developer')) {
      descriptors.push('tech-savvy engineer');
    }

    const descriptor = descriptors.length > 0 ? descriptors[0] : 'professional person';

    return `Professional portrait avatar of a ${descriptor} named ${name}. Modern, clean digital art style, friendly expression, suitable for a chat avatar. High quality, centered face, simple background.`;
  };

  const handleGenerateAvatar = async () => {
    const prompt = generationPrompt.trim() || getDefaultPrompt();

    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/agents/${agent.id}/avatar/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate avatar');
      }

      if (data.avatar) {
        setPreviewUrl(`data:${data.avatar.mimeType};base64,${data.avatar.imageData}`);
        onAvatarChange(agent.id, data.avatar);
      }
    } catch (err) {
      console.error('Avatar generation error:', err);
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB');
      return;
    }

    setError(null);

    // Convert to base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      const mimeType = file.type;

      try {
        const res = await fetch(`${API_BASE}/agents/${agent.id}/avatar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageData: base64, mimeType })
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to upload avatar');
        }

        setPreviewUrl(`data:${mimeType};base64,${base64}`);
        onAvatarChange(agent.id, { imageData: base64, mimeType });
      } catch (err) {
        console.error('Avatar upload error:', err);
        setError(err.message);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = async () => {
    try {
      await fetch(`${API_BASE}/agents/${agent.id}/avatar`, {
        method: 'DELETE'
      });
      setPreviewUrl(null);
      onAvatarChange(agent.id, null);
    } catch (err) {
      console.error('Failed to remove avatar:', err);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal avatar-editor-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>&times;</button>

        <h3>Edit Avatar for {agent.name}</h3>

        {/* Current/Preview Avatar */}
        <div className="avatar-preview-section">
          <div className="avatar-preview-large" style={{ backgroundColor: agent.color }}>
            {previewUrl ? (
              <img src={previewUrl} alt={agent.name} />
            ) : (
              <span className="avatar-initials">
                {agent.name.split(' ').map(n => n[0]).join('')}
              </span>
            )}
          </div>
          {previewUrl && (
            <button className="btn btn-sm btn-ghost" onClick={handleRemoveAvatar}>
              Remove Avatar
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="avatar-tabs">
          <button
            className={`avatar-tab ${activeTab === 'generate' ? 'active' : ''}`}
            onClick={() => setActiveTab('generate')}
          >
            🤖 Generate with AI
          </button>
          <button
            className={`avatar-tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            📤 Upload Image
          </button>
        </div>

        {error && (
          <div className="avatar-error">
            ⚠️ {error}
          </div>
        )}

        {/* Generate Tab */}
        {activeTab === 'generate' && (
          <div className="avatar-generate-section">
            <label>Generation Prompt</label>
            <textarea
              placeholder={getDefaultPrompt()}
              value={generationPrompt}
              onChange={(e) => setGenerationPrompt(e.target.value)}
              rows={4}
              disabled={isGenerating}
            />
            <p className="help-text">
              Leave empty to auto-generate based on agent bio, or customize the prompt.
            </p>
            <button
              className="btn btn-primary"
              onClick={handleGenerateAvatar}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <span className="spinner" />
                  Generating...
                </>
              ) : (
                '✨ Generate Avatar'
              )}
            </button>
          </div>
        )}

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="avatar-upload-section">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <div
              className="upload-dropzone"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="upload-icon">📷</span>
              <span>Click to upload an image</span>
              <span className="upload-hint">PNG, JPG, or GIF (max 5MB)</span>
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
