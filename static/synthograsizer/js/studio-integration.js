/**
 * Synthograsizer AI Studio Integration
 * Connects the frontend to the Python FastAPI backend
 */

class StudioIntegration {
    constructor(app) {
        this.app = app;
        this.baseUrl = '/api';
        this.apiKeyConfigured = false;
        this.chatHistory = [];
        this.isBatchRunning = false;
        this.selectedRefImages = []; // Store reference images {file, base64}
        this.templateGenMode = 'text'; // Template Generator active mode
        // Smart Video Options state
        this.svoState = {
            sourceImageB64: null,
            analysis: null,
            prompts: [],
            images: [null, null, null, null, null],
            videos: [null, null, null, null, null],
            phase: 'init'
        };
        window.studioIntegrationInstance = this;
        this.init();
    }

    init() {
        this.setupStyles();
        this.injectUI();
    }

    bindSafe(id, eventName, handler) {
        const el = document.getElementById(id);
        if (el) {
            el[eventName] = handler;
        } else {
            console.warn(`StudioIntegration: Element '${id}' not found for event '${eventName}'`);
        }
    }

    injectLightbox() {
        const lightbox = document.createElement('div');
        lightbox.className = 'studio-lightbox';
        lightbox.id = 'studio-lightbox';
        lightbox.innerHTML = `
            <button class="studio-lightbox-close" id="lightbox-close">&times;</button>
            <div class="studio-lightbox-counter" id="lightbox-counter"></div>
            <img id="lightbox-img" src="">
            <div class="studio-lightbox-controls">
                <button class="studio-lightbox-btn" id="lightbox-prev">&larr; Prev</button>
                <button class="studio-lightbox-btn" id="video-options-btn" style="background:rgba(156, 39, 176, 0.3); border-color:rgba(156, 39, 176, 0.6);">🎬 Smart Video Options</button>
                <button class="studio-lightbox-btn" id="scope-send-btn" style="background:rgba(0, 120, 200, 0.3); border-color:rgba(0, 120, 200, 0.6);">📡 Send to Scope</button>
                <button class="studio-lightbox-btn" id="lightbox-next">Next &rarr;</button>
            </div>
            <div class="studio-lightbox-hint" id="lightbox-hint">ESC to close · ← → to navigate</div>
        `;
        document.body.appendChild(lightbox);

        // Bind Lightbox Events with safety checks
        const closeBtn = document.getElementById('lightbox-close');
        if (closeBtn) closeBtn.onclick = () => this.closeLightbox();

        const lbEl = document.getElementById('studio-lightbox');
        if (lbEl) {
            lbEl.onclick = (e) => {
                if (e.target.id === 'studio-lightbox') this.closeLightbox();
            };
        }

        // Keyboard nav for lightbox
        document.addEventListener('keydown', (e) => {
            const activeLb = document.getElementById('studio-lightbox');
            if (!activeLb || !activeLb.classList.contains('active')) return;

            if (e.key === 'Escape') this.closeLightbox();
            if (e.key === 'ArrowLeft') this.navigateLightbox(-1);
            if (e.key === 'ArrowRight') this.navigateLightbox(1);
        });
    }

    setupStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .studio-controls-section {
                width: 100%;
                max-width: 800px;
                margin: 20px auto;
                padding: 15px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                border: 1px solid #eee;
            }

            .studio-controls-header {
                font-size: 14px;
                font-weight: 600;
                color: #555;
                margin-bottom: 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .studio-btn-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 12px;
            }

            .studio-btn-large {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 10px;
                padding: 16px 12px;
                border: 1px solid #eee;
                border-radius: 8px;
                background: #fff;
                cursor: pointer;
                transition: all 0.2s ease;
                min-height: 100px;
                text-align: center;
            }

            .studio-btn-large:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                border-color: transparent;
            }

            .studio-btn-large span.icon {
                font-size: 28px;
            }

            .studio-btn-large span.label {
                font-size: 12px;
                font-weight: 700;
                color: #333;
                text-shadow: 0 1px 2px rgba(0,0,0,0.12);
                letter-spacing: 0.03em;
            }
            
            .btn-chat-large { background: linear-gradient(to bottom right, #ffffff, #f0f7ff); border-bottom: 3px solid #2196F3; }
            .btn-chat-large:hover { background: #e3f2fd; }

            .btn-image-large { background: linear-gradient(to bottom right, #ffffff, #fff0f5); border-bottom: 3px solid #E91E63; }
            .btn-image-large:hover { background: #fce4ec; }

            .btn-video-large { background: linear-gradient(to bottom right, #ffffff, #f3e5f5); border-bottom: 3px solid #9C27B0; }
            .btn-video-large:hover { background: #f3e5f5; }

            .btn-transform-large { background: linear-gradient(to bottom right, #ffffff, #fff3e0); border-bottom: 3px solid #FF9800; }
            .btn-transform-large:hover { background: #fff3e0; }

            .btn-template-large { background: linear-gradient(to bottom right, #ffffff, #e0f2f1); border-bottom: 3px solid #009688; }
            .btn-template-large:hover { background: #e0f2f1; }

            .btn-analysis-large { background: linear-gradient(to bottom right, #ffffff, #e8eaf6); border-bottom: 3px solid #3f51b5; }
            .btn-analysis-large:hover { background: #e8eaf6; }

            .btn-metadata-large { background: linear-gradient(to bottom right, #ffffff, #fbe9e7); border-bottom: 3px solid #ff5722; }
            .btn-metadata-large:hover { background: #fbe9e7; }

            .btn-music-large { background: linear-gradient(to bottom right, #ffffff, #ede7f6); border-bottom: 3px solid #7c4dff; }
            .btn-music-large:hover { background: #ede7f6; }

            /* Music Studio specific */
            .music-playback-controls { display: flex; gap: 8px; margin: 12px 0; justify-content: center; }
            .music-playback-controls button {
                padding: 10px 24px; border: none; border-radius: 8px; font-size: 16px;
                cursor: pointer; font-weight: 600; transition: all 0.15s;
            }
            .music-btn-play { background: #4caf50; color: white; }
            .music-btn-play:hover { background: #43a047; }
            .music-btn-pause { background: #ff9800; color: white; }
            .music-btn-pause:hover { background: #f57c00; }
            .music-btn-stop { background: #f44336; color: white; }
            .music-btn-stop:hover { background: #d32f2f; }
            .music-status-dot {
                display: inline-block; width: 10px; height: 10px; border-radius: 50%;
                background: #999; margin-right: 6px; vertical-align: middle;
            }
            .music-status-dot.connected { background: #4caf50; }
            .music-status-dot.playing { background: #4caf50; animation: pulse-dot 1s infinite; }
            .music-status-dot.paused { background: #ff9800; }
            .music-status-dot.error { background: #f44336; }
            @keyframes pulse-dot { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
            .music-meter-canvas { width: 100%; height: 40px; border-radius: 6px; background: #1a1a2e; margin: 8px 0; }
            .music-slider-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
            .music-slider-row label { min-width: 90px; font-size: 13px; font-weight: 600; color: #555; }
            .music-slider-row input[type="range"] { flex: 1; }
            .music-slider-row .music-slider-value { min-width: 40px; text-align: right; font-size: 13px; color: #333; font-weight: 500; }
            .music-toggle-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
            .music-prompt-row { display: flex; gap: 8px; align-items: flex-end; margin: 4px 0; }
            .music-prompt-row textarea { flex: 1; min-height: 60px; resize: vertical; border: 1px solid #ddd; border-radius: 6px; padding: 8px; font-size: 13px; }
            .music-prompt-weight { width: 60px; }
            .music-prompts-list { display: flex; flex-direction: column; gap: 6px; }

            .file-preview {
                margin-top: 8px;
                display: none;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }

            .file-preview.active {
                display: inline-flex;
            }

            .file-preview img {
                width: 60px;
                height: 60px;
                object-fit: cover;
                border-radius: 6px;
                border: 1px solid #ddd;
                box-shadow: 0 2px 5px rgba(0,0,0,0.08);
            }

            .file-preview .preview-more {
                font-size: 11px;
                color: #555;
                border: 1px dashed #ccc;
                border-radius: 6px;
                padding: 4px 8px;
                background: #fff;
            }

            /* Reference Image Grid */
            .ref-image-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
                gap: 10px;
                margin-top: 10px;
            }
            .ref-image-item {
                position: relative;
                width: 100%;
                padding-top: 100%; /* Square aspect ratio */
                border-radius: 8px;
                overflow: hidden;
                border: 1px solid #ddd;
                background: #f9f9f9;
            }
            .ref-image-item img {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            .ref-image-remove {
                position: absolute;
                top: 2px;
                right: 2px;
                background: rgba(255, 0, 0, 0.8);
                color: white;
                border: none;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                font-size: 14px;
                line-height: 1;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2;
            }
            .ref-image-remove:hover {
                background: red;
            }
            .add-ref-btn {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 8px 12px;
                background: #f0f4f8;
                border: 1px dashed #bcccdc;
                border-radius: 6px;
                color: #334e68;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }
            .add-ref-btn:hover {
                background: #e1e8ef;
                border-color: #9fb3c8;
            }
            
            /* Lightbox */
            .studio-lightbox {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.9); z-index: 10001; display: none;
                justify-content: center; align-items: center; flex-direction: column;
            }
            .studio-lightbox.active { display: flex; animation: fadeIn 0.2s; }
            .studio-lightbox img { max-width: 90%; max-height: 80vh; box-shadow: 0 0 20px rgba(0,0,0,0.5); border-radius: 4px; }
            .studio-lightbox-controls { margin-top: 20px; display: flex; gap: 20px; }
            .studio-lightbox-btn {
                background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.5); 
                padding: 10px 20px; border-radius: 30px; cursor: pointer; font-weight: bold; transition: all 0.2s;
            }
            .studio-lightbox-btn:hover { background: white; color: black; transform: scale(1.1); }
            .studio-lightbox-close {
                position: absolute; top: 20px; right: 20px; color: white; font-size: 30px;
                cursor: pointer; background: none; border: none; opacity: 0.7;
            }
            .studio-lightbox-close:hover { opacity: 1; }
            .studio-lightbox-counter {
                position: absolute; top: 20px; left: 50%; transform: translateX(-50%);
                color: rgba(255,255,255,0.85); font-size: 14px; font-weight: 600;
                background: rgba(0,0,0,0.5); padding: 4px 14px; border-radius: 20px;
                font-family: 'Inter', sans-serif; letter-spacing: 0.5px;
            }
            .studio-lightbox-hint {
                position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
                color: rgba(255,255,255,0.45); font-size: 12px;
                font-family: 'Inter', sans-serif; white-space: nowrap;
                transition: opacity 3s ease;
            }

            /* Modals */
            .studio-modal {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: white; padding: 0; border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2); z-index: 10000; 
                width: 90%; max-width: 500px; display: none;
                max-height: 90vh; overflow-y: auto;
            }
            .studio-modal.active { display: block; animation: fadeIn 0.2s; }
            
            .studio-modal-header {
                padding: 15px 20px; border-bottom: 1px solid #eee;
                display: flex; justify-content: space-between; align-items: center;
            }
            .studio-modal-header h3 { margin: 0; font-size: 16px; }
            .studio-modal-body { padding: 20px; }
            
            .close-modal { background: none; border: none; font-size: 20px; cursor: pointer; color: #666; }
            
            .studio-input-group { margin-bottom: 15px; }
            .studio-input-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 5px; color: #333; }
            .studio-input-group input, .studio-input-group select, .studio-input-group textarea { 
                width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; 
                font-family: 'Inter', sans-serif; box-sizing: border-box;
            }

            .file-input-wrapper {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .clear-file-btn {
                background: #fce4ec;
                border: 1px solid #f8bbd0;
                color: #c2185b;
                border-radius: 6px;
                padding: 6px 10px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                display: none;
            }

            .clear-file-btn:hover {
                background: #c2185b;
                color: #fff;
            }

            .transform-prompt-box {
                margin-top: 15px;
                padding: 12px;
                background: #f3f4ff;
                border-radius: 8px;
                border: 1px solid #dfe3ff;
            }

            .transform-prompt-box h5 {
                margin: 0 0 8px 0;
                font-size: 13px;
                color: #4c4f8f;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .transform-prompt-box pre {
                margin: 0;
                white-space: pre-wrap;
                font-size: 12px;
                font-family: 'Inter', sans-serif;
                color: #333;
            }

            .studio-btn-primary {
                width: 100%; padding: 10px; background: #5e60ce; color: white; 
                border: none; border-radius: 6px; font-weight: 600; cursor: pointer;
            }
            .studio-btn-primary:hover { background: #4ea8de; }
            .studio-btn-danger { background: #ef5350; }
            .studio-btn-danger:hover { background: #e53935; }

            .modal-backdrop {
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.5); z-index: 9999; display: none;
            }
            .modal-backdrop.active { display: block; }

            /* Chat Window */
            .chat-window {
                position: fixed; bottom: 20px; right: 20px; width: 350px; height: 500px;
                background: white; border-radius: 12px; box-shadow: 0 5px 30px rgba(0,0,0,0.15);
                z-index: 9998; display: none; flex-direction: column;
                border: 1px solid #eee;
            }
            .chat-window.active { display: flex; animation: slideUp 0.3s; }
            
            .chat-header {
                padding: 12px 15px; background: #5e60ce; color: white; border-radius: 12px 12px 0 0;
                display: flex; justify-content: space-between; align-items: center;
                cursor: pointer;
            }
            .chat-body { flex: 1; padding: 15px; overflow-y: auto; background: #f9f9f9; }
            .chat-input-area {
                padding: 10px; border-top: 1px solid #eee; background: white; border-radius: 0 0 12px 12px;
                display: flex; gap: 8px;
            }
            .chat-input {
                flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 20px; outline: none;
            }
            .chat-send-btn {
                background: #5e60ce; color: white; border: none; width: 32px; height: 32px;
                border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;
            }
            
            .chat-model-select {
                background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3);
                border-radius: 4px; padding: 2px 6px; font-size: 11px; margin-left: 10px;
            }
            .chat-model-select option { color: black; }

            .chat-message {
                margin-bottom: 10px; max-width: 85%; padding: 8px 12px; border-radius: 12px;
                font-size: 13px; line-height: 1.4;
            }
            .chat-message.user { background: #e3f2fd; color: #1565c0; margin-left: auto; border-bottom-right-radius: 4px; }
            .chat-message.model { background: white; border: 1px solid #eee; margin-right: auto; border-bottom-left-radius: 4px; }
            .chat-message.system { background: #f5f5f5; color: #666; font-size: 11px; text-align: center; max-width: 100%; }

            /* Result Container */
            .studio-result-container {
                margin-top: 15px; padding: 15px; background: white; border-radius: 12px; 
                border: 1px solid #eee; display: none; position: relative;
            }
            .studio-result-container.active { display: block; }
            .studio-result-image, .studio-result-video { max-width: 100%; border-radius: 8px; display: block; margin: 0 auto; }

            /* Batch Grid */
            .studio-result-grid {
                display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px;
                max-height: 500px; overflow-y: auto; padding: 10px;
            }
            .studio-result-item {
                border: 1px solid #eee; border-radius: 8px; overflow: hidden; background: white;
                box-shadow: 0 2px 5px rgba(0,0,0,0.05); transition: transform 0.2s;
            }
            .studio-result-item:hover { transform: translateY(-2px); }
            .studio-result-item img, .studio-result-item video { width: 100%; height: 150px; object-fit: cover; display: block; }
            .studio-result-item p {
                font-size: 10px; padding: 8px; margin: 0; white-space: nowrap;
                overflow: hidden; text-overflow: ellipsis; color: #666; border-top: 1px solid #f5f5f5;
            }

            /* Toggles */
            .studio-toggle-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
            .studio-toggle-label { font-size: 12px; font-weight: 600; color: #333; }
            .studio-batch-options { padding: 10px; background: #f5f5f5; border-radius: 6px; margin-bottom: 15px; display: none; }
            .studio-batch-options.active { display: block; }

            /* Skeuomorphic Switch */
            .skeuo-switch-container {
                display: flex; justify-content: center; margin: 15px 0;
            }
            .skeuo-switch {
                position: relative; width: 220px; height: 44px;
                background: linear-gradient(145deg, #d1d1d1, #f0f0f0);
                box-shadow: 5px 5px 10px #bebebe, -5px -5px 10px #ffffff, inset 2px 2px 5px rgba(0,0,0,0.1);
                border-radius: 22px; cursor: pointer; display: flex; align-items: center; padding: 4px;
                box-sizing: border-box;
            }
            .skeuo-switch-knob {
                position: absolute; top: 4px; left: 4px; width: 104px; height: 36px;
                border-radius: 18px;
                background: linear-gradient(145deg, #ffffff, #e6e6e6);
                box-shadow: 2px 2px 5px rgba(0,0,0,0.2);
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                display: flex; align-items: center; justify-content: center;
                font-size: 11px; font-weight: 700; color: #444; text-transform: uppercase; letter-spacing: 0.5px;
                border: 1px solid rgba(255,255,255,0.8);
            }
            .skeuo-switch.active .skeuo-switch-knob {
                left: 112px;
                background: linear-gradient(145deg, #e3f2fd, #bbdefb);
                color: #1565c0;
            }
            .skeuo-label-left, .skeuo-label-right {
                flex: 1; text-align: center; font-size: 10px; font-weight: 600; color: #888; z-index: 1;
                pointer-events: none; user-select: none;
            }
            .skeuo-switch.active .skeuo-label-right { opacity: 0; }
            .skeuo-switch:not(.active) .skeuo-label-left { opacity: 0; }

            /* Video Mode Bar */
            .vmode-bar {
                display: flex; gap: 3px; margin-bottom: 10px;
                background: #f0f0f0; padding: 3px; border-radius: 8px;
            }
            .vmode-btn {
                flex: 1; padding: 7px 3px; font-size: 11px; font-weight: 600;
                border: none; border-radius: 6px; cursor: pointer;
                background: transparent; color: #666; white-space: nowrap;
                transition: all 0.2s; font-family: 'Inter', sans-serif;
            }
            .vmode-btn:hover:not(.active):not(:disabled) { background: #e0e0e0; color: #333; }
            .vmode-btn.active { background: #5e60ce; color: white; box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
            .vmode-btn:disabled { opacity: 0.35; cursor: not-allowed; }
            .vmode-hint {
                font-size: 11px; color: #444; margin-bottom: 12px;
                padding: 6px 10px; background: #ededff; border-radius: 6px;
                border-left: 3px solid #5e60ce; line-height: 1.4;
            }
            .vmode-panel { display: none; }
            .vmode-panel.active { display: block; }
            .vmode-desc { font-size: 11px; color: #777; margin: 0 0 10px; }

            /* Video Drop Zones */
            .vdrop-row { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
            .vdrop-wrap { flex: 1; min-width: 80px; display: flex; flex-direction: column; gap: 4px; }
            .vdrop-wrap > span { font-size: 10px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: .04em; }
            .vdrop-zone {
                position: relative; border: 2px dashed #ccc; border-radius: 8px;
                padding: 12px 6px; text-align: center; cursor: pointer;
                background: #fafafa; transition: border-color 0.15s, background 0.15s;
                min-height: 76px; display: flex; flex-direction: column;
                align-items: center; justify-content: center; gap: 3px; overflow: hidden;
            }
            .vdrop-zone:hover { border-color: #5e60ce; background: #f0f0ff; }
            .vdrop-zone.has-file { border-color: #5e60ce; border-style: solid; background: #ededff; }
            .vdrop-zone input[type="file"] {
                position: absolute; inset: 0; opacity: 0; cursor: pointer;
                width: 100%; height: 100%; font-size: 0;
            }
            .vdrop-thumb {
                width: 52px; height: 52px; object-fit: cover; border-radius: 5px;
                display: none; pointer-events: none;
            }
            .vdrop-zone-label { font-size: 11px; font-weight: 600; color: #555; pointer-events: none; }
            .vdrop-zone-hint { font-size: 10px; color: #aaa; pointer-events: none; }
            .vdrop-filename { font-size: 10px; color: #5e60ce; font-weight: 600; display: none; pointer-events: none; max-width: 90%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .vdrop-clear-btn {
                position: relative; z-index: 2; background: #fce4ec; border: 1px solid #f8bbd0;
                color: #c2185b; border-radius: 5px; padding: 3px 8px; font-size: 10px;
                font-weight: 700; cursor: pointer; display: none; margin-top: 2px;
            }
            .vdrop-clear-btn:hover { background: #c2185b; color: white; }

            /* Progress Bar */
            .batch-progress-container {
                margin-top: 15px; display: none;
            }
            .batch-progress-bar {
                width: 100%; height: 6px; background: #eee; border-radius: 3px; overflow: hidden;
            }
            .batch-progress-fill {
                height: 100%; width: 0%; background: #4caf50; transition: width 0.3s ease;
            }
            .batch-progress-status {
                font-size: 11px; color: #666; margin-top: 5px; text-align: center;
            }

            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

            /* Template Generator Mode Selector */
            .tg-mode-selector {
                display: flex;
                gap: 3px;
                margin-bottom: 15px;
                background: #f0f0f0;
                border-radius: 8px;
                padding: 3px;
            }
            .tg-mode-btn {
                flex: 1;
                padding: 8px 4px;
                border: none;
                background: transparent;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                color: #666;
                white-space: nowrap;
                font-family: 'Inter', sans-serif;
            }
            .tg-mode-btn.active {
                background: #009688;
                color: white;
                box-shadow: 0 1px 3px rgba(0,0,0,0.15);
            }
            .tg-mode-btn:hover:not(.active) {
                background: #e0e0e0;
                color: #333;
            }
            .tg-hint {
                background: #e0f2f1;
                padding: 10px;
                border-radius: 6px;
                margin-bottom: 12px;
                font-size: 12px;
                color: #00695c;
                line-height: 1.4;
            }
            .tg-preview {
                margin: 8px 0;
                max-height: 120px;
                overflow: hidden;
                border-radius: 6px;
            }
            .tg-preview img {
                max-height: 120px;
                max-width: 100%;
                border-radius: 6px;
                border: 1px solid #eee;
            }
            .tg-file-count {
                margin: 8px 0;
                font-size: 12px;
                color: #666;
                font-weight: 600;
            }
            .tg-current-template {
                background: #f5f5f5;
                padding: 10px;
                border-radius: 6px;
                font-size: 12px;
                color: #333;
                margin-bottom: 12px;
                border: 1px solid #e0e0e0;
                max-height: 80px;
                overflow: auto;
                line-height: 1.4;
            }

            /* Toast Notification System */
            .toast-container {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 100000;
                display: flex;
                flex-direction: column-reverse;
                gap: 8px;
                pointer-events: none;
            }
            .toast {
                pointer-events: auto;
                display: flex;
                align-items: center;
                gap: 10px;
                min-width: 280px;
                max-width: 420px;
                padding: 12px 16px;
                border-radius: 10px;
                font-family: 'Inter', sans-serif;
                font-size: 13px;
                line-height: 1.4;
                color: #fff;
                box-shadow: 0 6px 20px rgba(0,0,0,0.25);
                transform: translateX(120%);
                opacity: 0;
                transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s ease;
            }
            .toast.show {
                transform: translateX(0);
                opacity: 1;
            }
            .toast.hide {
                transform: translateX(120%);
                opacity: 0;
            }
            .toast-icon {
                font-size: 18px;
                flex-shrink: 0;
            }
            .toast-message {
                flex: 1;
                word-break: break-word;
            }
            .toast-close {
                background: none;
                border: none;
                color: rgba(255,255,255,0.7);
                font-size: 16px;
                cursor: pointer;
                padding: 0 2px;
                flex-shrink: 0;
                transition: color 0.2s;
            }
            .toast-close:hover { color: #fff; }
            .toast-success { background: #2e7d32; }
            .toast-error { background: #c62828; }
            .toast-warning { background: #e65100; }
            .toast-info { background: #1565c0; }

            /* Accessibility: Respect prefers-reduced-motion */
            @media (prefers-reduced-motion: reduce) {
                .studio-lightbox.active,
                .studio-modal.active,
                .chat-window.active,
                .toast { animation: none !important; }

                .toast {
                    transition: opacity 0.1s ease !important;
                    transform: translateX(0) !important;
                }
                .toast.show { opacity: 1; }
                .toast.hide { opacity: 0; }

                .studio-lightbox-btn,
                .studio-btn-large,
                .studio-btn-primary,
                .studio-lightbox-hint,
                .ref-image-item,
                .tg-mode-btn,
                * {
                    transition-duration: 0.01s !important;
                    animation-duration: 0.01s !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    injectUI() {
        const primaryActions = document.querySelector('.primary-actions-section');
        const outputSection = document.querySelector('.output-section');

        if (!primaryActions || !outputSection) {
            console.error('Studio Integration: Could not find required elements');
            return;
        }

        // 1. Inject Controls Section
        const controlsSection = document.createElement('section');
        controlsSection.className = 'studio-controls-section';
        controlsSection.innerHTML = `
            <div class="studio-controls-header">
                <span>AI Studio Tools</span>
            </div>
            <div class="studio-btn-grid">
                <button class="studio-btn-large btn-image-large" id="studio-image-btn">
                    <span class="icon">🎨</span>
                    <span class="label">Image Studio</span>
                </button>
                <button class="studio-btn-large btn-video-large" id="studio-video-btn">
                    <span class="icon">🎥</span>
                    <span class="label">Video Studio</span>
                </button>
                <button class="studio-btn-large btn-transform-large" id="studio-transform-btn">
                    <span class="icon">✨</span>
                    <span class="label">Transform</span>
                </button>
                <button class="studio-btn-large btn-chat-large" id="studio-chat-btn">
                    <span class="icon">💬</span>
                    <span class="label">AI Chat</span>
                </button>
                <button class="studio-btn-large btn-template-large" id="studio-template-btn">
                    <span class="icon">🧩</span>
                    <span class="label">Template Gen</span>
                </button>
                <button class="studio-btn-large btn-analysis-large" id="studio-analysis-btn">
                    <span class="icon">🔍</span>
                    <span class="label">Image Analysis</span>
                </button>
                <button class="studio-btn-large btn-metadata-large" id="studio-metadata-btn">
                    <span class="icon">📋</span>
                    <span class="label">Metadata</span>
                </button>
                <button class="studio-btn-large btn-music-large" id="studio-music-btn">
                    <span class="icon">🎵</span>
                    <span class="label">Music<br>Studio</span>
                </button>
                <button class="studio-btn-large btn-workflow-large" id="studio-workflow-btn">
                    <span class="icon">⚡</span>
                    <span class="label">Workflows</span>
                </button>
            </div>
        `;

        // Insert after primary actions (Generate/Randomize)
        primaryActions.parentNode.insertBefore(controlsSection, primaryActions.nextSibling);

        // 2. Inject Result Container
        const resultContainer = document.createElement('div');
        resultContainer.id = 'studio-result';
        resultContainer.className = 'studio-result-container';
        resultContainer.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid #eee;">
                <h4 style="margin:0; color:#555;">AI Studio Output</h4>
                <div style="display:flex; gap:10px;">
                    <button id="stop-batch-btn" style="display:none; color:red; border:1px solid red; background:white; border-radius:4px; padding:2px 8px; cursor:pointer;">Stop Batch</button>
                    <button id="retry-failed-btn" style="display:none; color:#e67e00; border:1px solid #e67e00; background:white; border-radius:4px; padding:2px 8px; cursor:pointer;">Retry Failed (0)</button>
                    <button id="close-studio-result" style="border:none; background:none; cursor:pointer; font-size:16px;">✕</button>
                </div>
            </div>
            <div id="studio-content"></div>
        `;
        outputSection.appendChild(resultContainer);

        // 3. Inject Toast Container
        if (!document.getElementById('toast-container')) {
            const toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }

        this.injectModals();
        this.setupFileClearButtons();
        this.setupVdropZones();
        this.injectChatWindow();
        this.injectLightbox();
        this.bindEvents();
    }

    injectModals() {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.id = 'modal-backdrop';
        document.body.appendChild(backdrop);

        // Global Settings Modal
        this.createModal('studio-settings-modal', 'Global Settings', `
            <div class="studio-input-group">
                <label>Google GenAI API Key</label>
                <input type="password" id="api-key-input" placeholder="AIza...">
            </div>
            <button class="studio-btn-primary" id="api-key-save">Save Configuration</button>
            <div style="margin-top:16px; padding:12px 14px; background:#fff8e1; border:1px solid #f59e0b; border-radius:8px; font-size:12px; line-height:1.6; color:#92400e;">
                <strong>⚠️ Local use only.</strong> This tool is designed to be run on your own machine.
                If you are accessing this page from a shared or hosted URL, do not enter your API key here —
                it would be stored in shared server memory with no session isolation, meaning other users
                could inadvertently make requests charged to your account.
                <a href="https://github.com/quitters/synthograsizer" target="_blank" style="color:#b45309; font-weight:600;">Run it locally</a> for safe key storage.
            </div>
        `);

        // Image Studio Modal
        this.createModal('image-studio-modal', 'Image Studio', `
            <div class="studio-toggle-row">
                <span class="studio-toggle-label">Batch Mode</span>
                <input type="checkbox" id="image-batch-toggle">
            </div>
            
            <div id="image-batch-options" class="studio-batch-options">
                <div class="studio-input-group">
                    <label>Upload JSON Batch File</label>
                    <input type="file" id="image-batch-file" accept=".json">
                </div>
                <div class="studio-input-group">
                    <label>Batch Reference Folder (Optional)</label>
                    <input type="file" id="image-batch-ref-folder" multiple webkitdirectory>
                    <small style="color:#666;">Select a folder to cycle through reference images.</small>
                </div>
                <div class="studio-toggle-row" style="margin-top:10px; padding:8px; background:#f0f8ff; border-radius:6px; border:1px solid #d0e8ff;">
                    <span class="studio-toggle-label" style="font-size:13px;">✨ Auto-Enhance Each Prompt</span>
                    <input type="checkbox" id="image-batch-enhance-toggle">
                </div>
                <small style="color:#666;">Or enter one prompt per line below.</small>
            </div>

            <div class="studio-input-group">
                <label>Prompt(s)</label>
                <textarea id="image-prompt-input" style="width:100%; height:80px; padding:8px; border:1px solid #ddd; border-radius:6px; resize:vertical; font-family:'Inter'"></textarea>
                <button type="button" id="enhance-prompt-btn" style="margin-top:8px; padding:8px 16px; background:#1E90FF; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px;">
                    ✨ Enhance Prompt
                </button>
            </div>
            <div class="studio-input-group">
                <label>Reference Images (Optional)</label>
                <div class="file-input-wrapper" style="flex-direction: column; align-items: flex-start;">
                    <input type="file" id="image-ref-input" accept="image/*" multiple style="display:none;" onchange="window.studioIntegrationInstance.handleRefImageSelect(event)">
                    <button type="button" class="add-ref-btn" id="add-ref-btn">
                        <span>+ Add Images</span>
                    </button>
                    <div id="ref-image-grid" class="ref-image-grid"></div>
                </div>
                <small style="color:#666; display:block; margin-top:4px;">Upload images to guide generation (Gemini only). Max 14.</small>
            </div>
            <div class="studio-input-group">
                <label>Model</label>
                <select id="image-model-select">
                    <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash (NB2)</option>
                    <option value="gemini-3-pro-image-preview">Gemini 3 Pro (NB Pro)</option>
                    <option value="gemini-2.5-flash-image">Gemini 2.5 Flash (NB)</option>
                </select>
            </div>
            <div class="studio-input-group">
                <label>Aspect Ratio</label>
                <select id="image-aspect-select">
                    <option value="1:1">1:1 (Square)</option>
                    <option value="21:9">21:9 (Cinematic)</option>
                    <option value="16:9">16:9 (Widescreen)</option>
                    <option value="8:1">8:1 (Ultra-Wide Banner)</option>
                    <option value="4:1">4:1 (Wide Banner)</option>
                    <option value="3:2">3:2 (Landscape)</option>
                    <option value="4:3">4:3 (Photo)</option>
                    <option value="5:4">5:4 (Flexible)</option>
                    <option value="4:5">4:5 (Flexible)</option>
                    <option value="3:4">3:4 (Portrait)</option>
                    <option value="2:3">2:3 (Portrait)</option>
                    <option value="9:16">9:16 (Vertical)</option>
                    <option value="1:4">1:4 (Tall Banner)</option>
                    <option value="1:8">1:8 (Ultra-Tall Banner)</option>
                </select>
                <div id="aspect-ratio-description" style="color:#666; font-size:12px; margin-top:5px; min-height:1.2em; font-style:italic;">Social media posts (Instagram), avatars, general purpose. (Default)</div>
            </div>

            <!-- Advanced Settings (Gemini 3) -->
            <div id="gemini-advanced-settings" style="display:none; background:#f0f4f8; border-radius:6px; margin-bottom:15px; border:1px solid #d9e2ec; overflow:hidden;">
                <div id="gemini-advanced-header" style="padding:10px; background:#e1e8ef; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-weight:600; color:#334e68; font-size:13px;">Gemini Advanced Settings</div>
                    <span id="gemini-advanced-arrow" style="font-size:12px; color:#666;">▼</span>
                </div>
                
                <div id="gemini-advanced-content" style="display:none; padding:10px;">
                    <!-- Reasoning -->
                    <div class="studio-input-group">
                        <label>Reasoning (Thinking Mode)</label>
                        <div style="display:flex; gap:15px; align-items:center;">
                            <select id="gemini-thinking-level" style="flex:1;">
                                <option value="MINIMAL">Minimal (Fast)</option>
                                <option value="HIGH">High (Deep Reasoning)</option>
                            </select>
                            <label style="display:flex; align-items:center; gap:5px; font-size:12px; cursor:pointer;">
                                <input type="checkbox" id="gemini-include-thoughts"> Include Thoughts
                            </label>
                        </div>
                    </div>

                    <!-- Config -->
                    <div class="studio-input-group">
                        <label>Configuration</label>
                        <div style="display:flex; gap:10px;">
                            <select id="gemini-person-generation" style="flex:1;">
                                <option value="allow_adult" selected>Person Gen: Allow Adult</option>
                                <option value="allow_all">Person Gen: Allow All</option>
                                <option value="dont_allow">Person Gen: Don't Allow</option>
                            </select>
                            <label style="display:flex; align-items:center; gap:5px; font-size:12px; cursor:pointer;">
                                <input type="checkbox" id="gemini-watermark"> Watermark
                            </label>
                        </div>
                    </div>

                    <!-- Resolution -->
                    <div class="studio-input-group">
                        <label>Reference Resolution</label>
                        <select id="gemini-media-resolution">
                            <option value="media_resolution_512">512px (Fastest, NB2 only)</option>
                            <option value="media_resolution_low" selected>1K (Fast)</option>
                            <option value="media_resolution_medium">2K (Balanced)</option>
                            <option value="media_resolution_high">4K (Best Quality)</option>
                        </select>
                    </div>

                    <!-- Google Search Grounding -->
                    <div class="studio-input-group">
                        <label style="display:flex; align-items:center; gap:5px; font-size:12px; cursor:pointer;">
                            <input type="checkbox" id="gemini-use-google-search"> Use Google Search Grounding
                        </label>
                        <div style="font-size:11px; color:#888; margin-top:5px;">Enable real-time data access for image generation</div>
                    </div>

                    <!-- Sampling Controls -->
                    <div class="studio-input-group">
                        <label>Sampling Controls</label>
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <span style="font-size:12px; color:#555; min-width:85px;">Temperature</span>
                                <input type="range" id="sampling-temperature" min="0" max="200" value="100" style="flex:1;">
                                <span id="sampling-temperature-val" style="font-size:12px; color:#333; min-width:30px; text-align:right;">1.0</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <span style="font-size:12px; color:#555; min-width:85px;">Top-K</span>
                                <input type="range" id="sampling-top-k" min="1" max="100" value="40" style="flex:1;">
                                <span id="sampling-top-k-val" style="font-size:12px; color:#333; min-width:30px; text-align:right;">40</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <span style="font-size:12px; color:#555; min-width:85px;">Top-P</span>
                                <input type="range" id="sampling-top-p" min="0" max="100" value="95" style="flex:1;">
                                <span id="sampling-top-p-val" style="font-size:12px; color:#333; min-width:30px; text-align:right;">0.95</span>
                            </div>
                        </div>
                        <div style="font-size:11px; color:#888; margin-top:5px;">Higher temperature = more creative. Lower Top-K/Top-P = more focused.</div>
                    </div>

                    <!-- Safety -->
                    <div class="studio-input-group">
                        <label>Safety Thresholds (Block Level)</label>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                            <select id="safety-hate-speech" title="Hate Speech">
                                <option value="BLOCK_MEDIUM_AND_ABOVE">Hate: Medium+</option>
                                <option value="BLOCK_ONLY_HIGH" selected>Hate: High Only</option>
                                <option value="BLOCK_NONE">Hate: None</option>
                            </select>
                            <select id="safety-sexual" title="Sexually Explicit">
                                <option value="BLOCK_MEDIUM_AND_ABOVE">Sexual: Medium+</option>
                                <option value="BLOCK_ONLY_HIGH">Sexual: High Only</option>
                                <option value="BLOCK_NONE" selected>Sexual: None</option>
                            </select>
                            <select id="safety-dangerous" title="Dangerous Content">
                                <option value="BLOCK_MEDIUM_AND_ABOVE">Danger: Medium+</option>
                                <option value="BLOCK_ONLY_HIGH">Danger: High Only</option>
                                <option value="BLOCK_NONE" selected>Danger: None</option>
                            </select>
                            <select id="safety-harassment" title="Harassment">
                                <option value="BLOCK_MEDIUM_AND_ABOVE">Harass: Medium+</option>
                                <option value="BLOCK_ONLY_HIGH" selected>Harass: High Only</option>
                                <option value="BLOCK_NONE">Harass: None</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <button class="studio-btn-primary" id="run-image-gen">Generate</button>
        `);

        // Smart Transform Modal
        this.createModal('smart-transform-modal', 'Smart Transform (Gemini)', `
            <div style="background:#e3f2fd; padding:10px; border-radius:6px; margin-bottom:15px; font-size:12px; color:#0d47a1; line-height:1.4;">
                <strong>Workflow:</strong> Analyze Input → Analyze Ref (Optional) → Generate Prompt → Create Image.<br>
                <em>Uses Gemini 2.0 Flash for analysis & Selected Model for generation.</em>
            </div>
            
             <div class="studio-toggle-row">
                <span class="studio-toggle-label">Batch Mode</span>
                <input type="checkbox" id="smart-transform-batch-toggle">
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
                <div class="studio-input-group">
                    <label>Model</label>
                    <select id="st-model-select">
                        <option value="gemini-3-pro-image-preview" selected>Gemini 3 Pro (NB Pro)</option>
                        <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash (NB2)</option>
                        <option value="gemini-2.5-flash-image">Gemini 2.5 Flash (NB)</option>
                    </select>
                </div>
                <div class="studio-input-group">
                    <label>Aspect Ratio</label>
                    <select id="st-aspect-select">
                        <option value="1:1" selected>1:1 (Square)</option>
                        <option value="16:9">16:9 (Landscape)</option>
                        <option value="9:16">9:16 (Portrait)</option>
                    </select>
                </div>
            </div>

            <div class="studio-input-group">
                <label>Input Image (Subject) *Required</label>
                <!-- Single Input -->
                <div class="file-input-wrapper" id="st-single-input-wrapper">
                    <input type="file" id="st-input-image" accept="image/*">
                    <button type="button" class="clear-file-btn" data-file-input="st-input-image">Remove</button>
                </div>
                <!-- Batch Folder Input -->
                <div class="file-input-wrapper" id="st-batch-input-wrapper" style="display:none; flex-direction:column; gap:10px;">
                     <div style="display:flex; flex-direction:column; gap:4px;">
                        <label style="font-size:11px; color:#555;">Option A: Select Folder</label>
                        <input type="file" id="st-input-folder" multiple webkitdirectory accept="image/*">
                     </div>
                     <div style="display:flex; flex-direction:column; gap:4px;">
                        <label style="font-size:11px; color:#555;">Option B: Select Multiple Files</label>
                        <input type="file" id="st-input-batch-files" multiple accept="image/*">
                     </div>
                     <small style="color:#666;">Choose a folder OR select multiple specific images.</small>
                </div>
            </div>
            <div class="studio-input-group">
                <label>Reference Image (Style/Optional)</label>
                <div class="file-input-wrapper">
                    <input type="file" id="st-ref-image" accept="image/*" multiple>
                    <button type="button" class="clear-file-btn" data-file-input="st-ref-image">Remove</button>
                    <div id="st-ref-preview" class="file-preview" data-max="10"></div>
                </div>
                <small style="color:#666;">Select multiple images to create a <strong>Style Matrix</strong> (1 Subject x Many Styles).</small>
            </div>
            <div class="studio-input-group">
                <label>User Intent (Transformation Instructions)</label>
                <textarea id="st-user-intent" placeholder="e.g. Transform my pfp into a 1996 SNES RPG character..." style="width:100%; height:80px; padding:8px; border:1px solid #ddd; border-radius:6px; resize:vertical; font-family:'Inter'"></textarea>
            </div>
            <button class="studio-btn-primary" id="run-smart-transform">Run Smart Transform</button>
        `);

        // Smart Video Options Modal — Multi-step workflow
        this.createModal('video-options-modal', '🎬 Smart Video Options', `
            <!-- Loading / Status Area -->
            <div id="svo-loading" style="text-align:center; padding:20px; display:none;">
                <div class="spinner"></div>
                <p id="svo-loading-text">Analyzing image...</p>
            </div>

            <!-- Phase 0: Reference + Prompt Input -->
            <div id="svo-input-section">
                <div style="display:flex; gap:16px; align-items:flex-start; margin-bottom:16px;">
                    <div id="svo-reference-preview" style="width:120px; height:120px; border-radius:8px; overflow:hidden; flex-shrink:0; background:#f0f0f0; display:flex; align-items:center; justify-content:center;">
                        <span style="color:#999; font-size:11px;">Reference</span>
                    </div>
                    <div style="flex:1;">
                        <div class="studio-input-group" style="margin-bottom:0;">
                            <label style="font-weight:600;">Creative Direction</label>
                            <textarea id="svo-user-prompt" placeholder="Describe how you want to reimagine this image...&#10;e.g. 'reimagine as different seasons' or 'transform into anime style variations'" style="width:100%; height:80px; padding:8px; border:1px solid #ddd; border-radius:6px; resize:vertical; font-family:'Inter';" disabled></textarea>
                        </div>
                    </div>
                </div>
                <div style="display:flex; gap:12px; margin-bottom:12px;">
                    <div style="flex:1;">
                        <label style="font-size:11px; font-weight:600; color:#555;">Image Aspect Ratio</label>
                        <select id="svo-image-aspect" style="width:100%; padding:6px; border:1px solid #ddd; border-radius:6px; font-family:'Inter'; font-size:12px;">
                            <option value="1:1" selected>1:1 (Square)</option>
                            <option value="21:9">21:9 (Cinematic)</option>
                            <option value="16:9">16:9 (Widescreen)</option>
                            <option value="8:1">8:1 (Ultra-Wide)</option>
                            <option value="4:1">4:1 (Wide Banner)</option>
                            <option value="3:2">3:2 (Landscape)</option>
                            <option value="4:3">4:3 (Photo)</option>
                            <option value="5:4">5:4 (Flexible)</option>
                            <option value="4:5">4:5 (Flexible)</option>
                            <option value="3:4">3:4 (Portrait)</option>
                            <option value="2:3">2:3 (Portrait)</option>
                            <option value="9:16">9:16 (Vertical)</option>
                            <option value="1:4">1:4 (Tall Banner)</option>
                            <option value="1:8">1:8 (Ultra-Tall)</option>
                        </select>
                    </div>
                    <div style="flex:1;">
                        <label style="font-size:11px; font-weight:600; color:#555;">Video Aspect Ratio</label>
                        <select id="svo-video-aspect" style="width:100%; padding:6px; border:1px solid #ddd; border-radius:6px; font-family:'Inter'; font-size:12px;">
                            <option value="9:16" selected>9:16 (Portrait)</option>
                            <option value="16:9">16:9 (Landscape)</option>
                        </select>
                    </div>
                </div>
                <button class="studio-btn-primary" id="svo-generate-images-btn" disabled style="width:100%;">
                    ✨ Generate 5 Variations
                </button>
            </div>

            <!-- Phase 1: Image Variations Grid -->
            <div id="svo-image-section" style="display:none; margin-top:20px;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                    <hr style="flex:1; border:none; border-top:1px solid #e0e0e0;">
                    <span style="font-size:12px; font-weight:600; color:#666; white-space:nowrap;">Image Variations</span>
                    <hr style="flex:1; border:none; border-top:1px solid #e0e0e0;">
                </div>
                <div id="svo-image-grid" style="display:grid; grid-template-columns:repeat(5, 1fr); gap:10px;"></div>
                <button class="studio-btn-primary" id="svo-accept-videos-btn" style="width:100%; margin-top:16px; display:none; background:#4CAF50;">
                    ✅ Accept Images & Generate Videos
                </button>
            </div>

            <!-- Phase 2: Video Results Grid -->
            <div id="svo-video-section" style="display:none; margin-top:20px;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                    <hr style="flex:1; border:none; border-top:1px solid #e0e0e0;">
                    <span style="font-size:12px; font-weight:600; color:#666; white-space:nowrap;">Video Results</span>
                    <hr style="flex:1; border:none; border-top:1px solid #e0e0e0;">
                </div>
                <div id="svo-video-grid" style="display:grid; grid-template-columns:repeat(5, 1fr); gap:10px;"></div>
            </div>

            <!-- Hidden State -->
            <input type="hidden" id="svo-source-image" value="">
            <input type="hidden" id="svo-analysis" value="">
        `);

        // Template Generator Modal (5 Modes)
        this.createModal('template-gen-modal', 'Template Generator', `
            <div class="tg-mode-selector">
                <button class="tg-mode-btn active" data-mode="text">📝 Text</button>
                <button class="tg-mode-btn" data-mode="image">🖼️ Image</button>
                <button class="tg-mode-btn" data-mode="hybrid">🎨 Hybrid</button>
                <button class="tg-mode-btn" data-mode="multi-image">📚 Multi</button>
                <button class="tg-mode-btn" data-mode="remix">🔄 Remix</button>
                <button class="tg-mode-btn" data-mode="workflow">⚙️ Workflow</button>
                <button class="tg-mode-btn" data-mode="story">📖 Story</button>
            </div>

            <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; padding:8px 12px; background:rgba(0,150,136,0.06); border-radius:6px; border:1px solid rgba(0,150,136,0.15);">
                <span style="font-size:12px; font-weight:600; color:#555;">AI Model:</span>
                <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer; color:#009688;">
                    <input type="radio" name="tg-model-choice" value="pro" checked style="accent-color:#009688;"> Pro <span style="color:#999; font-weight:normal;">(quality)</span>
                </label>
                <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer; color:#FF9800;">
                    <input type="radio" name="tg-model-choice" value="flash" style="accent-color:#FF9800;"> Flash <span style="color:#999; font-weight:normal;">(speed)</span>
                </label>
            </div>
            <div class="tg-panel" id="tg-panel-text">
                <div class="tg-hint">
                    <strong>Text Mode:</strong> Describe what kind of prompt template you want, and AI will build it for you with variables and options.
                </div>
                <div class="studio-input-group">
                    <label>Template Description</label>
                    <textarea id="template-prompt-input" placeholder="e.g. A template for generating sci-fi weapon descriptions with variables for type, energy source, and damage effect..." style="width:100%; height:100px; padding:8px; border:1px solid #ddd; border-radius:6px; resize:vertical; font-family:'Inter'"></textarea>
                </div>
            </div>

            <!-- Image Mode -->
            <div class="tg-panel" id="tg-panel-image" style="display:none">
                <div class="tg-hint">
                    <strong>Image Mode:</strong> Upload an image and AI will analyze its style, composition, and aesthetic to create a template that captures its essence with customizable variables.
                </div>
                <div class="studio-input-group">
                    <label>Reference Image</label>
                    <input type="file" id="tg-image-input" accept="image/*">
                </div>
                <div id="tg-image-preview" class="tg-preview"></div>
            </div>

            <!-- Hybrid Mode -->
            <div class="tg-panel" id="tg-panel-hybrid" style="display:none">
                <div class="tg-hint">
                    <strong>Hybrid Mode:</strong> Upload a reference image for aesthetic/style guidance, then describe what variables and structure you want. The image sets the visual baseline; your text defines the controls.
                </div>
                <div class="studio-input-group">
                    <label>Style Reference Image</label>
                    <input type="file" id="tg-hybrid-image" accept="image/*">
                </div>
                <div id="tg-hybrid-preview" class="tg-preview"></div>
                <div class="studio-input-group">
                    <label>Template Direction</label>
                    <textarea id="tg-hybrid-direction" placeholder="e.g. Create a portrait studio template with variables for lighting, mood, and camera angle" style="width:100%; height:80px; padding:8px; border:1px solid #ddd; border-radius:6px; resize:vertical; font-family:'Inter'"></textarea>
                </div>
            </div>

            <!-- Multi-Image Mode -->
            <div class="tg-panel" id="tg-panel-multi-image" style="display:none">
                <div class="tg-hint">
                    <strong>Multi-Image Mode:</strong> Upload multiple images and AI will find the common aesthetic pattern across them. Shared traits become fixed style; differences become template variables.
                </div>
                <div class="studio-input-group">
                    <label>Select Images (2 or more)</label>
                    <input type="file" id="tg-multi-image-input" accept="image/*" multiple>
                </div>
                <div id="tg-multi-image-count" class="tg-file-count"></div>
            </div>

            <!-- Remix Mode -->
            <div class="tg-panel" id="tg-panel-remix" style="display:none">
                <div class="tg-hint">
                    <strong>Remix Mode:</strong> Modify the currently loaded template using natural language. Add variables, change values, restructure the prompt — existing elements are preserved unless you say otherwise.
                </div>
                <div id="tg-remix-current" class="tg-current-template">No template loaded</div>
                <div class="studio-input-group">
                    <label>Remix Instructions</label>
                    <textarea id="tg-remix-instruction" placeholder="e.g. Add a 'time_of_day' variable with morning, noon, and night options" style="width:100%; height:80px; padding:8px; border:1px solid #ddd; border-radius:6px; resize:vertical; font-family:'Inter'"></textarea>
                </div>
            </div>

            <!-- Workflow Mode -->
            <div class="tg-panel" id="tg-panel-workflow" style="display:none">
                <div class="tg-hint">
                    <strong>Workflow Mode:</strong> Upload a workflow JSON and reference image(s). AI curates each variable group down to a single value — selecting the option that best matches the image while honoring the workflow's original intent.
                </div>
                <div class="studio-input-group">
                    <label>Workflow JSON</label>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <input type="file" id="tg-workflow-json" accept=".json,application/json" style="flex:1;">
                        <button id="tg-workflow-use-current" class="studio-btn-secondary" style="font-size:11px; padding:6px 10px;">Use Current Template</button>
                    </div>
                </div>
                <div id="tg-workflow-json-preview" class="tg-current-template" style="max-height:100px; overflow:auto; font-size:11px;">No workflow loaded</div>
                <div class="studio-input-group">
                    <label>Reference Image(s) <span style="font-weight:normal; color:#888;">(select multiple for batch curation)</span></label>
                    <input type="file" id="tg-workflow-image" accept="image/*" multiple>
                </div>
                <div id="tg-workflow-image-preview" class="tg-preview" style="display:flex; flex-wrap:wrap; gap:8px;"></div>
                <div id="tg-workflow-image-count" class="tg-file-count" style="font-size:11px; color:#666; margin-top:4px;"></div>
                <div class="studio-input-group">
                    <label>Curation Guidance <span style="font-weight:normal; color:#888;">(optional)</span></label>
                    <textarea id="tg-workflow-guidance" placeholder="e.g. Focus on matching the color palette and mood rather than the subject..." style="width:100%; height:60px; padding:8px; border:1px solid #ddd; border-radius:6px; resize:vertical; font-family:'Inter'"></textarea>
                </div>
                <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
                    <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
                        <input type="checkbox" id="tg-workflow-preview" checked>
                        <span>Preview selections with rationale before importing</span>
                    </label>
                </div>
            </div>

            <!-- Story Mode -->
            <div class="tg-panel" id="tg-panel-story" style="display:none">
                <div class="tg-hint">
                    <strong>Story Mode:</strong> Describe a narrative concept and AI will generate a template with characters (visual continuity anchors), acts (pacing structure with locks and biases), and progression arcs (variables that evolve across the sequence). Use Batch Generator's Story Mode to produce sequential prompts.
                </div>
                <div class="studio-input-group">
                    <label>Story Concept</label>
                    <textarea id="tg-story-prompt" placeholder="e.g. A medieval tournament story: two rival knights compete across 3 acts — arrival at the castle, the jousting contest, and the victory feast. Include time-of-day progression from dawn to sunset." style="width:100%; height:120px; padding:8px; border:1px solid #ddd; border-radius:6px; resize:vertical; font-family:'Inter'"></textarea>
                </div>
            </div>

            <button class="studio-btn-primary" id="run-template-gen" style="background:#009688;">Generate & Import Template</button>
        `);

        // Image Analysis Modal
        this.createModal('image-analysis-modal', 'Image Analysis (Reverse Prompt)', `
            <div style="background:#e8eaf6; padding:10px; border-radius:6px; margin-bottom:15px; font-size:12px; color:#283593; line-height:1.4;">
                <strong>Reverse Engineering:</strong> Upload an image to generate a detailed, structured prompt that describes it. Useful for recreating styles or understanding composition.
            </div>
            
            <div class="studio-toggle-row">
                <span class="studio-toggle-label">Batch Mode</span>
                <input type="checkbox" id="analysis-batch-toggle">
            </div>
            
            <div id="analysis-batch-options" class="studio-batch-options">
                <div class="studio-input-group">
                    <label>Select Folder of Images</label>
                    <input type="file" id="analysis-batch-folder" multiple webkitdirectory accept="image/*">
                    <small style="color:#666;">Select a folder to analyze all images sequentially</small>
                </div>
            </div>
            
            <div class="studio-input-group">
                <label>Image to Analyze</label>
                <input type="file" id="analysis-input-image" accept="image/*">
            </div>
            
            <div class="studio-input-group">
                <label style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="analysis-auto-generate">
                    <span>Auto-generate image from prompt (Gemini 3 Pro)</span>
                </label>
                <small style="color:#666;">Automatically creates an image using the analysis prompt with matched aspect ratio</small>
            </div>
            
            <div class="studio-input-group">
                <label style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="analysis-auto-template">
                    <span>Auto-generate Template from Analysis</span>
                </label>
                <small style="color:#666;">Automatically create and import a Synthograsizer template based on the analysis.</small>
            </div>
            
            <button class="studio-btn-primary" id="run-image-analysis">Analyze Image</button>
            
            <div id="analysis-result-box" style="display:none; margin-top:15px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <label style="font-weight:600;">Analysis Result</label>
                    <button id="copy-analysis-btn" style="padding:4px 12px; background:#4CAF50; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px;">Copy</button>
                </div>
                <textarea id="analysis-result-text" readonly style="width:100%; height:200px; padding:8px; border:1px solid #ddd; border-radius:6px; font-family:'Inter'; font-size:13px; background:#f9f9f9; resize:vertical;"></textarea>
            </div>
        `);

        // Video Studio Modal
        this.createModal('video-studio-modal', 'Video Studio', `
            <!-- Workflow Mode Bar -->
            <div class="vmode-bar" id="video-workflow-bar" style="margin-bottom:14px;">
                <button class="vmode-btn active" data-vwf="standard">Standard</button>
                <button class="vmode-btn" data-vwf="batch">Batch</button>
                <button class="vmode-btn" data-vwf="story">Story / Thematic</button>
            </div>

            <!-- Standard Video UI -->
            <div id="video-std-ui">
                <div class="studio-input-group">
                    <label id="video-prompt-label">Prompt</label>
                    <textarea id="video-prompt-input" style="width:100%; height:72px; padding:8px; border:1px solid #ddd; border-radius:6px; resize:vertical; font-family:'Inter'"></textarea>
                </div>

                <!-- Generation Mode Bar -->
                <div class="vmode-bar" id="video-mode-bar">
                    <button class="vmode-btn active" data-mode="text">Text</button>
                    <button class="vmode-btn" data-mode="image">Image</button>
                    <button class="vmode-btn" data-mode="interpolate">Interpolate</button>
                    <button class="vmode-btn vmode-31only" data-mode="reference" disabled>Reference</button>
                    <button class="vmode-btn vmode-31only" data-mode="extend" disabled>Extend</button>
                </div>
                <div class="vmode-hint" id="video-model-hint">Veo 3.1 Preview &mdash; All modes &middot; 720p, 1080p, 4K &middot; Audio</div>

                <!-- Text mode: no extra inputs -->
                <div class="vmode-panel active" id="vmode-panel-text">
                    <p class="vmode-desc">Pure text-to-video. The prompt alone drives generation.</p>
                </div>

                <!-- Image-to-video mode -->
                <div class="vmode-panel" id="vmode-panel-image">
                    <p class="vmode-desc">Animate from a starting frame. The image becomes the first shot.</p>
                    <div class="vdrop-row">
                        <div class="vdrop-wrap">
                            <span>Starting Frame</span>
                            <div class="vdrop-zone" id="vdrop-first-frame">
                                <input type="file" id="video-first-frame-input" accept="image/*">
                                <img class="vdrop-thumb" id="vdrop-first-frame-thumb" src="" alt="">
                                <div class="vdrop-zone-label">Click to browse</div>
                                <div class="vdrop-zone-hint">JPG, PNG, WEBP</div>
                                <div class="vdrop-filename" id="vdrop-first-frame-name"></div>
                            </div>
                            <button type="button" class="vdrop-clear-btn" data-zone="vdrop-first-frame">Remove</button>
                        </div>
                    </div>
                </div>

                <!-- Interpolation mode -->
                <div class="vmode-panel" id="vmode-panel-interpolate">
                    <p class="vmode-desc">Define the first and last frame &mdash; Veo generates the transition. Requires 8s duration.</p>
                    <div class="vdrop-row">
                        <div class="vdrop-wrap">
                            <span>Start</span>
                            <div class="vdrop-zone" id="vdrop-interp-start">
                                <input type="file" id="video-first-frame-input-interp" accept="image/*">
                                <img class="vdrop-thumb" id="vdrop-interp-start-thumb" src="" alt="">
                                <div class="vdrop-zone-label">First Frame</div>
                                <div class="vdrop-zone-hint">Click to browse</div>
                                <div class="vdrop-filename" id="vdrop-interp-start-name"></div>
                            </div>
                            <button type="button" class="vdrop-clear-btn" data-zone="vdrop-interp-start">Remove</button>
                        </div>
                        <div class="vdrop-wrap">
                            <span>End</span>
                            <div class="vdrop-zone" id="vdrop-interp-end">
                                <input type="file" id="video-last-frame-input" accept="image/*">
                                <img class="vdrop-thumb" id="vdrop-interp-end-thumb" src="" alt="">
                                <div class="vdrop-zone-label">Last Frame</div>
                                <div class="vdrop-zone-hint">Click to browse</div>
                                <div class="vdrop-filename" id="vdrop-interp-end-name"></div>
                            </div>
                            <button type="button" class="vdrop-clear-btn" data-zone="vdrop-interp-end">Remove</button>
                        </div>
                    </div>
                </div>

                <!-- Reference image direction mode (Veo 3.1 full/fast only) -->
                <div class="vmode-panel" id="vmode-panel-reference">
                    <p class="vmode-desc">Provide up to 3 reference images (subject, costume, product) &mdash; Veo preserves their appearance in the output. Requires 8s duration.</p>
                    <div class="vdrop-row">
                        <div class="vdrop-wrap">
                            <span>Ref 1</span>
                            <div class="vdrop-zone" id="vdrop-ref1">
                                <input type="file" id="video-ref1-input" accept="image/*">
                                <img class="vdrop-thumb" id="vdrop-ref1-thumb" src="" alt="">
                                <div class="vdrop-zone-label">Click to browse</div>
                                <div class="vdrop-zone-hint">JPG, PNG, WEBP</div>
                                <div class="vdrop-filename" id="vdrop-ref1-name"></div>
                            </div>
                            <button type="button" class="vdrop-clear-btn" data-zone="vdrop-ref1">Remove</button>
                        </div>
                        <div class="vdrop-wrap">
                            <span>Ref 2</span>
                            <div class="vdrop-zone" id="vdrop-ref2">
                                <input type="file" id="video-ref2-input" accept="image/*">
                                <img class="vdrop-thumb" id="vdrop-ref2-thumb" src="" alt="">
                                <div class="vdrop-zone-label">Click to browse</div>
                                <div class="vdrop-zone-hint">JPG, PNG, WEBP</div>
                                <div class="vdrop-filename" id="vdrop-ref2-name"></div>
                            </div>
                            <button type="button" class="vdrop-clear-btn" data-zone="vdrop-ref2">Remove</button>
                        </div>
                        <div class="vdrop-wrap">
                            <span>Ref 3</span>
                            <div class="vdrop-zone" id="vdrop-ref3">
                                <input type="file" id="video-ref3-input" accept="image/*">
                                <img class="vdrop-thumb" id="vdrop-ref3-thumb" src="" alt="">
                                <div class="vdrop-zone-label">Click to browse</div>
                                <div class="vdrop-zone-hint">JPG, PNG, WEBP</div>
                                <div class="vdrop-filename" id="vdrop-ref3-name"></div>
                            </div>
                            <button type="button" class="vdrop-clear-btn" data-zone="vdrop-ref3">Remove</button>
                        </div>
                    </div>
                </div>

                <!-- Video extension mode (Veo 3.1 full/fast only) -->
                <div class="vmode-panel" id="vmode-panel-extend">
                    <p class="vmode-desc">Extend a previously Veo-generated video by ~7 seconds. Aspect ratio and resolution are inherited from the source — Duration and Aspect Ratio controls are not used here.</p>
                    <div class="studio-input-group">
                        <label>Recent Generations</label>
                        <select id="video-extend-recent-select" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px; font-family:'Inter'; box-sizing:border-box;">
                            <option value="">— Select a recent generation —</option>
                        </select>
                        <button type="button" id="video-extend-refresh-btn" style="margin-top:5px; background:none; border:1px solid #ccc; border-radius:5px; padding:4px 10px; font-size:11px; cursor:pointer; color:#555;">Refresh list</button>
                    </div>
                    <div class="studio-input-group">
                        <label>Or paste a video URI directly</label>
                        <input type="text" id="video-extend-uri-input" placeholder="https://generativelanguage.googleapis.com/v1beta/files/..." style="width:100%; padding:8px; border:1px solid #ddd; border-radius:6px; font-family:'Inter'; box-sizing:border-box; font-size:12px;">
                        <small style="color:#888; margin-top:4px; display:block;">The URI is returned after each generation and is valid for 48 hours.</small>
                    </div>
                </div>
            </div>

            <!-- Simple Batch Workflow UI -->
            <div id="video-simple-batch-ui" style="display:none;">
                <!-- Batch type sub-tabs -->
                <div class="vmode-bar" id="video-batch-type-bar" style="margin-bottom:12px;">
                    <button class="vmode-btn active" data-btype="prompts">Text Prompts</button>
                    <button class="vmode-btn" data-btype="images">Image Folder</button>
                </div>

                <!-- Prompts mode -->
                <div id="vbatch-prompts-panel">
                    <div class="studio-input-group">
                        <label>Prompts <span style="font-weight:normal;color:#888;">(one per line)</span></label>
                        <textarea id="video-batch-prompts" placeholder="A cinematic shot of a wave crashing at sunset\nAn astronaut floating through a neon nebula\n..." style="width:100%; height:110px; padding:8px; border:1px solid #ddd; border-radius:6px; resize:vertical; font-family:'Inter'; font-size:12px;"></textarea>
                    </div>
                    <div class="studio-input-group">
                        <label>Or upload a .txt file <span style="font-weight:normal;color:#888;">(one prompt per line)</span></label>
                        <input type="file" id="video-batch-prompts-file" accept=".txt,.csv">
                    </div>
                </div>

                <!-- Images mode -->
                <div id="vbatch-images-panel" style="display:none;">
                    <div class="studio-input-group">
                        <label>Source Images <span style="font-weight:normal;color:#888;">(each animates as image-to-video)</span></label>
                        <div class="file-input-wrapper">
                            <input type="file" id="video-batch-images" accept="image/*" multiple webkitdirectory>
                            <button type="button" class="clear-file-btn" data-file-input="video-batch-images" data-preview-target="video-batch-images-preview">Remove</button>
                        </div>
                        <div class="file-preview" id="video-batch-images-preview" data-max="50"></div>
                        <small style="color:#666; display:block; margin-top:4px;">Select a folder or pick multiple images. Each will become its own video clip.</small>
                    </div>
                    <div class="studio-input-group">
                        <label>Shared Prompt <span style="font-weight:normal;color:#888;">(optional — applied to every clip)</span></label>
                        <textarea id="video-batch-shared-prompt" placeholder="Cinematic slow motion, golden hour lighting..." style="width:100%; height:60px; padding:8px; border:1px solid #ddd; border-radius:6px; resize:vertical; font-family:'Inter'; font-size:12px;"></textarea>
                    </div>
                </div>

                <div style="display:flex; align-items:center; gap:10px; margin-top:10px;">
                    <label style="font-size:12px; color:#555; white-space:nowrap;">Concurrency</label>
                    <select id="video-batch-concurrency" style="padding:4px 6px; border:1px solid #ddd; border-radius:4px; font-family:'Inter'; font-size:12px;">
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3" selected>3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                    </select>
                    <small style="color:#888;">simultaneous generations</small>
                </div>

                <div class="batch-progress-container" id="simple-batch-progress-ui" style="display:none;">
                    <div class="batch-progress-bar"><div class="batch-progress-fill" id="simple-batch-progress-fill"></div></div>
                    <div class="batch-progress-status" id="simple-batch-progress-text">Waiting to start...</div>
                </div>
            </div>

            <!-- Story / Thematic Batch Workflow UI -->
            <div id="video-batch-ui" style="display:none;">
                <div class="skeuo-switch-container">
                    <div class="skeuo-switch" id="batch-mode-switch">
                        <div class="skeuo-label-left">NARRATIVE</div>
                        <div class="skeuo-label-right">THEMATIC</div>
                        <div class="skeuo-switch-knob" id="batch-mode-knob">STORY MODE</div>
                    </div>
                </div>
                <!-- Hidden Input for Mode -->
                <input type="hidden" id="batch-mode-value" value="story">

                <div class="studio-input-group">
                    <label>North Star Prompt (The Guide)</label>
                    <textarea id="video-north-star" placeholder="Describe the plot (Story) or the aesthetic theme (Artwork)..." style="width:100%; height:60px; padding:8px; border:1px solid #ddd; border-radius:6px; resize:vertical; font-family:'Inter'"></textarea>
                </div>

                <div class="studio-input-group">
                    <label>Source Images (Max 12)</label>
                    <div class="file-input-wrapper">
                        <input type="file" id="video-batch-input" accept="image/*" multiple>
                        <button type="button" class="clear-file-btn" data-file-input="video-batch-input" data-preview-target="video-batch-preview">Remove</button>
                    </div>
                    <div class="file-preview" id="video-batch-preview" data-max="12"></div>
                    <small style="color:#666; display:block; margin-top:4px;">Upload up to 12 images for the grid.</small>
                </div>
                
                <div class="batch-progress-container" id="batch-progress-ui">
                    <div class="batch-progress-bar"><div class="batch-progress-fill" id="batch-progress-fill"></div></div>
                    <div class="batch-progress-status" id="batch-progress-text">Waiting to start...</div>
                </div>
            </div>

                <div class="form-group">
                    <label>Model</label>
                    <select id="video-model-select" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;">
                        <option value="veo-3.1-generate-preview" selected>Veo 3.1 Preview</option>
                        <option value="veo-3.1-fast-generate-preview">Veo 3.1 Fast Preview</option>
                        <option value="veo-3.1-lite-generate-preview">Veo 3.1 Lite Preview</option>
                        <option value="veo-3.0-generate-preview">Veo 3.0 Preview</option>
                    </select>
                </div>
                
                <!-- Duration: shown only in Text & Image modes, and when resolution is 720p -->
                <div id="video-duration-control" class="studio-input-group">
                    <label>Duration</label>
                    <select id="video-duration-select">
                        <option value="4">4 Seconds (Default)</option>
                        <option value="6">6 Seconds</option>
                        <option value="8">8 Seconds</option>
                    </select>
                </div>
                <!-- Shown when mode or resolution forces 8s -->
                <div id="video-duration-locked-note" style="display:none; font-size:11px; color:#888; padding:5px 10px; background:#f5f5f5; border-radius:6px; margin-bottom:10px;">
                    Duration: 8 seconds (required for this mode or resolution)
                </div>

                <div id="video-aspect-control" class="studio-input-group">
                    <label>Aspect Ratio</label>
                    <select id="video-aspect-select">
                        <option value="16:9" selected>16:9 (Landscape)</option>
                        <option value="9:16">9:16 (Portrait)</option>
                    </select>
                </div>

                <div id="video-resolution-control" class="studio-input-group">
                    <label>Resolution</label>
                    <select id="video-resolution-select">
                        <option value="720p" selected>720p (Default)</option>
                        <option value="1080p">1080p (8s only)</option>
                        <option value="4k" id="video-res-4k-option">4K (8s only &middot; Veo 3.1 only)</option>
                    </select>
                    <small style="color:#888; display:block; margin-top:4px;">Audio is always included in Veo 3.1 outputs.</small>
                </div>

                <!-- Shown only in Extend mode -->
                <div id="video-extend-locked-note" style="display:none; font-size:11px; color:#888; padding:5px 10px; background:#f5f5f5; border-radius:6px; margin-bottom:10px;">
                    Duration, Aspect Ratio, and Resolution are inherited from the source video.
                </div>
            
            <button class="studio-btn-primary" id="run-video-gen">Generate</button>
        `);

        // Metadata Reader Modal
        this.createModal('metadata-reader-modal', 'Metadata Reader', `
            <div class="studio-toggle-row">
                <span class="studio-toggle-label">Batch Mode</span>
                <input type="checkbox" id="metadata-batch-toggle">
            </div>

            <div id="metadata-batch-options" class="studio-batch-options">
                <div class="studio-input-group">
                    <label>Select Folder of PNG Images</label>
                    <input type="file" id="metadata-batch-folder" multiple webkitdirectory accept="image/png">
                    <small style="color:#666;">Select a folder to extract metadata from all PNGs.</small>
                </div>
            </div>

            <div class="studio-input-group" id="metadata-single-input-group">
                <label>Upload PNG Image</label>
                <input type="file" id="metadata-input-image" accept="image/png">
                <small style="color:#666;">Upload a PNG image generated by this tool to read its prompt.</small>
            </div>
            <button class="studio-btn-primary" id="run-metadata-read">Read Metadata</button>
            
            <div id="metadata-result-area" style="display:none; margin-top:15px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                    <label>Extracted Metadata</label>
                    <button id="metadata-add-fav-btn" style="display:none; font-size:11px; padding:3px 8px; cursor:pointer; background:#e91e63; color:white; border:none; border-radius:4px;">❤️ Add to Liked</button>
                </div>
                <textarea id="metadata-output" readonly style="width:100%; height:200px; padding:8px; border:1px solid #ddd; border-radius:6px; font-family:'Inter'; font-size:13px; background:#f9f9f9;"></textarea>
            </div>
        `);

        // Music Studio Modal (Lyria RealTime)
        this.createModal('music-studio-modal', 'Music Studio (Lyria RealTime)', `
            <div style="margin-bottom:10px;">
                <span class="music-status-dot" id="music-status-dot"></span>
                <span id="music-status-text" style="font-size:13px; color:#666;">Disconnected</span>
            </div>

            <canvas id="music-level-meter" class="music-meter-canvas" width="400" height="40"></canvas>

            <div class="music-playback-controls">
                <button class="music-btn-play" id="music-play-btn">▶ Play</button>
                <button class="music-btn-pause" id="music-pause-btn">⏸ Pause</button>
                <button class="music-btn-stop" id="music-stop-btn">⏹ Stop</button>
            </div>

            <div class="studio-input-group">
                <label>Prompts <button id="music-add-prompt-btn" style="font-size:11px; padding:2px 8px; cursor:pointer; border:1px solid #ccc; border-radius:4px; background:white;">+ Add Prompt</button></label>
                <div class="music-prompts-list" id="music-prompts-list">
                    <div class="music-prompt-row" data-idx="0">
                        <textarea id="music-prompt-0" placeholder="e.g. minimal techno with deep bass, sparse percussion, atmospheric synths"></textarea>
                        <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
                            <label style="font-size:11px; min-width:auto;">Wt</label>
                            <input type="number" class="music-prompt-weight" id="music-weight-0" value="1.0" min="0.1" max="3.0" step="0.1" style="width:55px; padding:4px; border:1px solid #ddd; border-radius:4px; font-size:12px;">
                        </div>
                    </div>
                </div>
                <button class="studio-btn-primary" id="music-send-prompts-btn" style="margin-top:8px;">Send Prompts</button>
            </div>

            <div class="studio-input-group" style="margin-top:12px;">
                <label>Generation Config</label>

                <div class="music-slider-row">
                    <label>BPM</label>
                    <input type="range" id="music-bpm" min="60" max="200" value="120" step="1">
                    <span class="music-slider-value" id="music-bpm-val">120</span>
                </div>
                <div class="music-slider-row">
                    <label>Density</label>
                    <input type="range" id="music-density" min="0" max="100" value="50" step="1">
                    <span class="music-slider-value" id="music-density-val">0.50</span>
                </div>
                <div class="music-slider-row">
                    <label>Brightness</label>
                    <input type="range" id="music-brightness" min="0" max="100" value="50" step="1">
                    <span class="music-slider-value" id="music-brightness-val">0.50</span>
                </div>
                <div class="music-slider-row">
                    <label>Guidance</label>
                    <input type="range" id="music-guidance" min="0" max="60" value="40" step="1">
                    <span class="music-slider-value" id="music-guidance-val">4.0</span>
                </div>
                <div class="music-slider-row">
                    <label>Temperature</label>
                    <input type="range" id="music-temperature" min="0" max="30" value="11" step="1">
                    <span class="music-slider-value" id="music-temperature-val">1.1</span>
                </div>
                <div class="music-slider-row">
                    <label>Volume</label>
                    <input type="range" id="music-volume" min="0" max="100" value="80" step="1">
                    <span class="music-slider-value" id="music-volume-val">80%</span>
                </div>

                <div class="music-slider-row">
                    <label>Scale</label>
                    <select id="music-scale" style="flex:1; padding:6px; border:1px solid #ddd; border-radius:4px; font-size:13px;">
                        <option value="SCALE_UNSPECIFIED" selected>Auto (Model decides)</option>
                        <option value="C_MAJOR_A_MINOR">C Major / A Minor</option>
                        <option value="D_FLAT_MAJOR_B_FLAT_MINOR">D♭ Major / B♭ Minor</option>
                        <option value="D_MAJOR_B_MINOR">D Major / B Minor</option>
                        <option value="E_FLAT_MAJOR_C_MINOR">E♭ Major / C Minor</option>
                        <option value="E_MAJOR_D_FLAT_MINOR">E Major / C♯ Minor</option>
                        <option value="F_MAJOR_D_MINOR">F Major / D Minor</option>
                        <option value="G_FLAT_MAJOR_E_FLAT_MINOR">G♭ Major / E♭ Minor</option>
                        <option value="G_MAJOR_E_MINOR">G Major / E Minor</option>
                        <option value="A_FLAT_MAJOR_F_MINOR">A♭ Major / F Minor</option>
                        <option value="A_MAJOR_G_FLAT_MINOR">A Major / F♯ Minor</option>
                        <option value="B_FLAT_MAJOR_G_MINOR">B♭ Major / G Minor</option>
                        <option value="B_MAJOR_A_FLAT_MINOR">B Major / G♯ Minor</option>
                    </select>
                </div>

                <div class="music-slider-row">
                    <label>Mode</label>
                    <select id="music-mode" style="flex:1; padding:6px; border:1px solid #ddd; border-radius:4px; font-size:13px;">
                        <option value="QUALITY" selected>Quality</option>
                        <option value="DIVERSITY">Diversity</option>
                        <option value="VOCALIZATION">Vocalization</option>
                    </select>
                </div>
            </div>

            <div style="display:flex; gap:16px; flex-wrap:wrap; margin-top:8px;">
                <div class="music-toggle-row">
                    <input type="checkbox" id="music-mute-bass"> <label for="music-mute-bass" style="font-size:13px;">Mute Bass</label>
                </div>
                <div class="music-toggle-row">
                    <input type="checkbox" id="music-mute-drums"> <label for="music-mute-drums" style="font-size:13px;">Mute Drums</label>
                </div>
                <div class="music-toggle-row">
                    <input type="checkbox" id="music-only-bass-drums"> <label for="music-only-bass-drums" style="font-size:13px;">Only Bass & Drums</label>
                </div>
            </div>

            <div style="margin-top:12px; padding:10px; background:#f5f0ff; border-radius:8px; border:1px solid #d1c4e9;">
                <div class="music-toggle-row">
                    <input type="checkbox" id="music-auto-sync">
                    <label for="music-auto-sync" style="font-size:13px; font-weight:600; color:#5e35b1;">Auto-Sync with Synthograsizer</label>
                </div>
                <small style="color:#666; display:block; margin-top:4px;">When enabled, changing variables in the main UI will smoothly transition the music to match the new prompt.</small>
            </div>
        `);
    }

    setupFileClearButtons() {
        const clearButtons = document.querySelectorAll('.clear-file-btn');
        clearButtons.forEach(btn => {
            const targetId = btn.getAttribute('data-file-input');
            const previewId = btn.getAttribute('data-preview-target');
            const input = document.getElementById(targetId);
            const preview = previewId ? document.getElementById(previewId) : null;
            if (!input) return;

            const toggleVisibility = () => {
                const hasFile = input.files && input.files.length;
                btn.style.display = hasFile ? 'inline-flex' : 'none';
                if (preview) {
                    preview.classList.toggle('active', !!hasFile);
                }
            };

            const updatePreview = () => {
                if (!preview) return;
                const img = preview.querySelector('img');
                if (input.files && input.files.length && img) {
                    const file = input.files[0];
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        img.src = e.target.result;
                        img.style.display = 'block'; // Show the image when loaded
                    };
                    reader.readAsDataURL(file);
                } else if (img) {
                    img.src = '';
                    img.style.display = 'none'; // Hide when no file
                }
            };

            const handleChange = () => {
                toggleVisibility();
                updatePreview();
            };

            toggleVisibility();

            input.addEventListener('change', handleChange);
            btn.addEventListener('click', () => {
                input.value = '';
                input.dispatchEvent(new Event('change')); // ensures any downstream logic fires
                toggleVisibility();
                if (preview) {
                    const img = preview.querySelector('img');
                    if (img) {
                        img.src = '';
                        img.style.display = 'none';
                    }
                }
            });
        });
    }

    populateExtendRecentList() {
        const select = document.getElementById('video-extend-recent-select');
        if (!select) return;
        try {
            const stored = JSON.parse(sessionStorage.getItem('veo_recent_generations') || '[]');
            // Remove expired entries (older than 47h to give a safety margin)
            const cutoff = Date.now() - 47 * 60 * 60 * 1000;
            const valid = stored.filter(g => g.timestamp > cutoff);
            if (valid.length !== stored.length) {
                sessionStorage.setItem('veo_recent_generations', JSON.stringify(valid));
            }
            select.innerHTML = '<option value="">— Select a recent generation —</option>';
            if (!valid.length) {
                select.innerHTML += '<option value="" disabled>No recent generations (generate a video first)</option>';
            } else {
                valid.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = g.uri;
                    opt.textContent = g.label;
                    select.appendChild(opt);
                });
            }
        } catch (_) {}
    }

    setupVdropZones() {
        document.querySelectorAll('.vdrop-zone').forEach(zone => {
            const input    = zone.querySelector('input[type="file"]');
            const thumb    = zone.querySelector('.vdrop-thumb');
            const filename = zone.querySelector('.vdrop-filename');
            const label    = zone.querySelector('.vdrop-zone-label');
            const hint     = zone.querySelector('.vdrop-zone-hint');
            const clearBtn = zone.parentElement?.querySelector('.vdrop-clear-btn');
            if (!input) return;

            const isImage = input.accept.includes('image');

            const applyFile = (file) => {
                if (!file) return;
                zone.classList.add('has-file');
                if (filename) { filename.textContent = file.name; filename.style.display = 'block'; }
                if (label) label.style.display = 'none';
                if (hint)  hint.style.display  = 'none';
                if (clearBtn) clearBtn.style.display = 'inline-block';
                if (isImage && thumb) {
                    const reader = new FileReader();
                    reader.onload = (e) => { thumb.src = e.target.result; thumb.style.display = 'block'; };
                    reader.readAsDataURL(file);
                }
            };

            const clearZone = () => {
                input.value = '';
                zone.classList.remove('has-file');
                if (thumb)    { thumb.src = ''; thumb.style.display = 'none'; }
                if (filename) { filename.textContent = ''; filename.style.display = 'none'; }
                if (label) label.style.display = 'block';
                if (hint)  hint.style.display  = 'block';
                if (clearBtn) clearBtn.style.display = 'none';
            };

            input.addEventListener('change', () => { if (input.files[0]) applyFile(input.files[0]); });

            // Drag-and-drop
            zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = '#5e60ce'; });
            zone.addEventListener('dragleave', () => { if (!zone.classList.contains('has-file')) zone.style.borderColor = ''; });
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.style.borderColor = '';
                const file = e.dataTransfer?.files[0];
                if (!file) return;
                const dt = new DataTransfer();
                dt.items.add(file);
                input.files = dt.files;
                applyFile(file);
            });

            if (clearBtn) {
                clearBtn.addEventListener('click', (e) => { e.stopPropagation(); clearZone(); });
            }
        });
    }

    createModal(id, title, contentHTML) {
        // Prevent duplicates
        const existing = document.getElementById(id);
        if (existing) {
            existing.remove();
        }

        const modal = document.createElement('div');
        modal.className = 'studio-modal';
        modal.id = id;
        modal.innerHTML = `
            <div class="studio-modal-content">
                <div class="studio-modal-header">
                    <h3>${title}</h3>
                    <button class="studio-close-modal">&times;</button>
                </div>
                <div class="studio-modal-body">${contentHTML}</div>
            </div>
        `;
        document.body.appendChild(modal);

        // Bind close button
        modal.querySelector('.studio-close-modal').onclick = () => this.closeAllModals();
    }
    injectChatWindow() {
        const chat = document.createElement('div');
        chat.className = 'chat-window';
        chat.id = 'chat-window';
        chat.innerHTML = `
            <div class="chat-header" id="chat-header-bar">
                <div style="display:flex;align-items:center;">
                    <span>🤖 Chat</span>
                    <select id="chat-model-select" class="chat-model-select" onclick="event.stopPropagation()">
                        <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                        <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                    </select>
                </div>
                <button style="background:none;border:none;color:white;cursor:pointer;" onclick="document.getElementById('chat-window').classList.remove('active')">▼</button>
            </div>
            <div class="chat-body" id="chat-body">
                <div class="chat-message system">Welcome to Synthograsizer Chat!</div>
            </div>
            <div class="chat-input-area">
                <input type="text" class="chat-input" id="chat-input" placeholder="Type a message...">
                <button class="chat-send-btn" id="chat-send">➤</button>
            </div>
        `;
        document.body.appendChild(chat);
    }

    bindEvents() {
        // Main Buttons
        this.bindSafe('studio-settings-btn', 'onclick', () => this.openModal('studio-settings-modal'));
        this.bindSafe('api-key-btn', 'onclick', () => this.openModal('studio-settings-modal'));
        this.bindSafe('studio-chat-btn', 'onclick', () => this.openChat());
        this.bindSafe('studio-transform-btn', 'onclick', () => this.openModal('smart-transform-modal'));
        this.bindSafe('studio-template-btn', 'onclick', () => {
            this.openModal('template-gen-modal');
            // Refresh remix panel info when opening the modal
            if (this.templateGenMode === 'remix') {
                const info = document.getElementById('tg-remix-current');
                if (info && this.app && this.app.currentTemplate) {
                    const t = this.app.currentTemplate;
                    const varNames = (t.variables || []).map(v => v.feature_name || v.name).join(', ');
                    const preview = (t.promptTemplate || '').substring(0, 80);
                    info.innerHTML = `<strong>Current:</strong> ${preview}${preview.length >= 80 ? '...' : ''}<br><small>Variables: ${varNames || 'none'}</small>`;
                } else if (info) {
                    info.innerHTML = '⚠️ No template loaded. Load a template first, then come back to remix it.';
                }
            }
        });
        this.bindSafe('studio-analysis-btn', 'onclick', () => this.openModal('image-analysis-modal'));
        this.bindSafe('studio-metadata-btn', 'onclick', () => this.openModal('metadata-reader-modal'));
        this.bindSafe('studio-workflow-btn', 'onclick', () => {
            if (window.workflowRunner) window.workflowRunner.open();
        });
        this.bindSafe('enhance-prompt-btn', 'onclick', () => this.enhancePrompt());

        // ── Music Studio ──────────────────────────────────────────
        this.musicClient = new MusicStudioClient(this.app);

        this.bindSafe('studio-music-btn', 'onclick', () => {
            // Auto-fill prompt from current Synthograsizer output
            const prompt0 = document.getElementById('music-prompt-0');
            if (prompt0 && this.getCurrentPrompt) {
                prompt0.value = this.getCurrentPrompt();
            }
            this.openModal('music-studio-modal');
        });

        this.bindSafe('music-play-btn', 'onclick', () => {
            this.musicClient.connect();
            // Small delay to let WS connect, then send prompts + config + play
            setTimeout(() => {
                this._musicSendPrompts();
                this._musicSendConfig();
                this.musicClient.play();
                const meter = document.getElementById('music-level-meter');
                if (meter) this.musicClient.attachMeter(meter);
            }, 500);
        });

        this.bindSafe('music-pause-btn', 'onclick', () => this.musicClient.pause());
        this.bindSafe('music-stop-btn', 'onclick', () => {
            this.musicClient.stop();
            this.musicClient.disconnect();
        });

        this.bindSafe('music-send-prompts-btn', 'onclick', () => this._musicSendPrompts());

        // Add Prompt button
        this.bindSafe('music-add-prompt-btn', 'onclick', () => {
            const list = document.getElementById('music-prompts-list');
            if (!list) return;
            const idx = list.children.length;
            const row = document.createElement('div');
            row.className = 'music-prompt-row';
            row.dataset.idx = idx;
            row.innerHTML = `
                <textarea id="music-prompt-${idx}" placeholder="Additional prompt to blend..."></textarea>
                <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
                    <label style="font-size:11px; min-width:auto;">Wt</label>
                    <input type="number" class="music-prompt-weight" id="music-weight-${idx}" value="1.0" min="0.1" max="3.0" step="0.1" style="width:55px; padding:4px; border:1px solid #ddd; border-radius:4px; font-size:12px;">
                </div>
                <button onclick="this.parentElement.remove()" style="background:none; border:none; cursor:pointer; font-size:18px; color:#999;" title="Remove">×</button>
            `;
            list.appendChild(row);
        });

        // Slider value displays
        const musicSliders = [
            { id: 'music-bpm', valId: 'music-bpm-val', fmt: v => v },
            { id: 'music-density', valId: 'music-density-val', fmt: v => (v / 100).toFixed(2) },
            { id: 'music-brightness', valId: 'music-brightness-val', fmt: v => (v / 100).toFixed(2) },
            { id: 'music-guidance', valId: 'music-guidance-val', fmt: v => (v / 10).toFixed(1) },
            { id: 'music-temperature', valId: 'music-temperature-val', fmt: v => (v / 10).toFixed(1) },
            { id: 'music-volume', valId: 'music-volume-val', fmt: v => v + '%' },
        ];
        musicSliders.forEach(({ id, valId, fmt }) => {
            const slider = document.getElementById(id);
            const display = document.getElementById(valId);
            if (slider && display) {
                slider.addEventListener('input', () => {
                    display.textContent = fmt(parseInt(slider.value));
                    // Live config update for non-context-reset params
                    if (id === 'music-volume') {
                        this.musicClient.setVolume(parseInt(slider.value) / 100);
                    } else if (this.musicClient.status === 'playing') {
                        this._musicSendConfig();
                    }
                });
            }
        });

        // BPM and Scale need context reset — warn user
        ['music-bpm', 'music-scale'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => {
                    if (this.musicClient.status === 'playing') {
                        this.showToast('BPM/Scale change requires context reset — brief interruption', 'info');
                        this._musicSendConfig();
                        this.musicClient.resetContext();
                    }
                });
            }
        });

        // Auto-sync toggle
        const autoSyncCheck = document.getElementById('music-auto-sync');
        if (autoSyncCheck) {
            autoSyncCheck.addEventListener('change', () => {
                this.musicClient.enableAutoSync(autoSyncCheck.checked);
            });
        }

        // Status listener
        window.addEventListener('music-status', (e) => {
            const dot = document.getElementById('music-status-dot');
            const text = document.getElementById('music-status-text');
            if (!dot || !text) return;
            const s = e.detail.status;
            dot.className = 'music-status-dot ' + s;
            text.textContent = s.charAt(0).toUpperCase() + s.slice(1);
        });

        // Error listener
        window.addEventListener('music-error', (e) => {
            this.showToast(e.detail.error, 'error');
        });

        // Aspect Ratio Description Logic
        const aspectSelect = document.getElementById('image-aspect-select');
        const aspectDesc = document.getElementById('aspect-ratio-description');
        if (aspectSelect && aspectDesc) {
            const descriptions = {
                "1:1": "Social media posts (Instagram), avatars, general purpose. (Default)",
                "21:9": "YouTube videos, presentations, cinematic/movie scenes.",
                "16:9": "YouTube videos, presentations, cinematic/movie scenes.",
                "3:2": "Standard photography, older TV formats.",
                "4:3": "Standard photography, older TV formats.",
                "5:4": "Art prints, specific social media feed formats.",
                "4:5": "Art prints, specific social media feed formats.",
                "3:4": "Editorial photography, posters, marketing print.",
                "2:3": "Editorial photography, posters, marketing print.",
                "9:16": "TikTok, YouTube Shorts, Instagram Reels, mobile wallpapers."
            };

            aspectSelect.addEventListener('change', () => {
                aspectDesc.textContent = descriptions[aspectSelect.value] || "";
            });
        }

        // Toggle Advanced Settings based on model
        const modelSelect = document.getElementById('image-model-select');
        const advancedSettings = document.getElementById('gemini-advanced-settings');
        if (modelSelect && advancedSettings) {
            const checkModel = () => {
                if (modelSelect.value.startsWith('gemini')) {
                    advancedSettings.style.display = 'block';
                } else {
                    advancedSettings.style.display = 'none';
                }
            };
            modelSelect.addEventListener('change', checkModel);
            // Run once to set initial state
            setTimeout(checkModel, 100);
        }

        // Advanced Settings Toggle Logic
        const advancedHeader = document.getElementById('gemini-advanced-header');
        const advancedContent = document.getElementById('gemini-advanced-content');
        const advancedArrow = document.getElementById('gemini-advanced-arrow');

        if (advancedHeader && advancedContent && advancedArrow) {
            advancedHeader.addEventListener('click', () => {
                const isHidden = advancedContent.style.display === 'none';
                advancedContent.style.display = isHidden ? 'block' : 'none';
                advancedArrow.textContent = isHidden ? '▲' : '▼';
            });
        }

        // Sampling control slider bindings
        const tempSlider = document.getElementById('sampling-temperature');
        const tempVal = document.getElementById('sampling-temperature-val');
        if (tempSlider && tempVal) {
            tempSlider.addEventListener('input', () => {
                tempVal.textContent = (tempSlider.value / 100).toFixed(2);
            });
        }
        const topKSlider = document.getElementById('sampling-top-k');
        const topKVal = document.getElementById('sampling-top-k-val');
        if (topKSlider && topKVal) {
            topKSlider.addEventListener('input', () => {
                topKVal.textContent = topKSlider.value;
            });
        }
        const topPSlider = document.getElementById('sampling-top-p');
        const topPVal = document.getElementById('sampling-top-p-val');
        if (topPSlider && topPVal) {
            topPSlider.addEventListener('input', () => {
                topPVal.textContent = (topPSlider.value / 100).toFixed(2);
            });
        }

        this.bindSafe('studio-image-btn', 'onclick', () => {
            // Auto-fill prompt from app ONLY if input is empty (Persistence)
            const promptInput = document.getElementById('image-prompt-input');
            if (promptInput && !promptInput.value.trim()) {
                const currentPrompt = this.getCurrentPrompt();
                if (currentPrompt) {
                    promptInput.value = currentPrompt;
                }
            }

            // Do NOT reset selectedRefImages here to allow persistence
            // this.selectedRefImages = []; 

            this.renderRefImages(); // Ensure any persisted images are shown
            this.openModal('image-studio-modal');
        });

        this.bindSafe('studio-video-btn', 'onclick', () => {
            const currentPrompt = this.getCurrentPrompt();
            if (currentPrompt) {
                const promptInput = document.getElementById('video-prompt-input');
                if (promptInput) promptInput.value = currentPrompt;
            }
            this.openModal('video-studio-modal');
        });

        // Modal Actions
        this.bindSafe('api-key-save', 'onclick', () => this.saveApiKey());
        this.bindSafe('run-image-gen', 'onclick', () => this.generateImage());
        this.bindSafe('run-video-gen', 'onclick', () => this.generateVideo());
        this.bindSafe('run-smart-transform', 'onclick', () => this.runSmartTransform());
        this.bindSafe('run-template-gen', 'onclick', () => this.runTemplateGen());

        // Template Generator Mode Selector
        document.querySelectorAll('.tg-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active button
                document.querySelectorAll('.tg-mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Hide all panels, show selected
                const mode = btn.dataset.mode;
                this.templateGenMode = mode;
                document.querySelectorAll('.tg-panel').forEach(p => p.style.display = 'none');
                const panel = document.getElementById(`tg-panel-${mode}`);
                if (panel) panel.style.display = 'block';

                // Update button text
                const genBtn = document.getElementById('run-template-gen');
                const labels = {
                    'text': 'Generate & Import Template',
                    'image': 'Analyze & Generate Template',
                    'hybrid': 'Generate Hybrid Template',
                    'multi-image': 'Extract Pattern & Generate',
                    'remix': 'Remix Template',
                    'workflow': 'Curate Workflow',
                    'story': 'Generate Story Template'
                };
                if (genBtn) genBtn.textContent = labels[mode] || 'Generate & Import Template';

                // Remix: show current template info
                if (mode === 'remix') {
                    const info = document.getElementById('tg-remix-current');
                    if (info && this.app && this.app.currentTemplate) {
                        const t = this.app.currentTemplate;
                        const varNames = (t.variables || []).map(v => v.feature_name || v.name).join(', ');
                        const preview = (t.promptTemplate || '').substring(0, 80);
                        info.innerHTML = `<strong>Current:</strong> ${preview}${preview.length >= 80 ? '...' : ''}<br><small>Variables: ${varNames || 'none'}</small>`;
                    } else if (info) {
                        info.innerHTML = '⚠️ No template loaded. Load a template first, then come back to remix it.';
                    }
                }

                // Workflow: reset state when switching to this mode
                if (mode === 'workflow') {
                    this.workflowModeTemplate = null;
                    const jsonPreview = document.getElementById('tg-workflow-json-preview');
                    if (jsonPreview) jsonPreview.innerHTML = 'No workflow loaded';
                }
            });
        });

        // Template Generator Image Previews
        this.bindSafe('tg-image-input', 'onchange', async (e) => {
            const preview = document.getElementById('tg-image-preview');
            if (preview && e.target.files[0]) {
                const b64 = await this.readFileAsBase64(e.target.files[0]);
                preview.innerHTML = `<img src="${b64}">`;
            } else if (preview) { preview.innerHTML = ''; }
        });

        this.bindSafe('tg-hybrid-image', 'onchange', async (e) => {
            const preview = document.getElementById('tg-hybrid-preview');
            if (preview && e.target.files[0]) {
                const b64 = await this.readFileAsBase64(e.target.files[0]);
                preview.innerHTML = `<img src="${b64}">`;
            } else if (preview) { preview.innerHTML = ''; }
        });

        this.bindSafe('tg-multi-image-input', 'onchange', (e) => {
            const countEl = document.getElementById('tg-multi-image-count');
            if (countEl) {
                const count = e.target.files.length;
                countEl.textContent = count > 0 ? `${count} image${count !== 1 ? 's' : ''} selected` : '';
            }
        });

        // Workflow Mode: "Use Current Template" button
        this.bindSafe('tg-workflow-use-current', 'onclick', () => {
            if (this.app?.currentTemplate) {
                this.workflowModeTemplate = this.app.currentTemplate;
                const preview = document.getElementById('tg-workflow-json-preview');
                if (preview) {
                    const t = this.app.currentTemplate;
                    const varInfo = (t.variables || []).map(v => `${v.feature_name || v.name} (${(v.values || []).length} options)`).join(', ');
                    preview.innerHTML = `<strong>Using current template:</strong> ${(t.promptTemplate || '').substring(0, 60)}...<br><small>Variables: ${varInfo || 'none'}</small>`;
                }
                this.showToast("Using current template as workflow.", 'info');
            } else {
                this.showToast("No template currently loaded.", 'warning');
            }
        });

        // Workflow Mode: JSON file upload
        this.bindSafe('tg-workflow-json', 'onchange', async (e) => {
            const preview = document.getElementById('tg-workflow-json-preview');
            if (e.target.files.length) {
                try {
                    const text = await this.readFileAsText(e.target.files[0]);
                    const json = JSON.parse(text);
                    this.workflowModeTemplate = json;
                    const varInfo = (json.variables || []).map(v => `${v.feature_name || v.name} (${(v.values || []).length} options)`).join(', ');
                    preview.innerHTML = `<strong>Loaded:</strong> ${(json.promptTemplate || '').substring(0, 60)}...<br><small>Variables: ${varInfo || 'none'}</small>`;
                } catch (err) {
                    preview.innerHTML = `<span style="color:red;">Invalid JSON file: ${err.message}</span>`;
                    this.workflowModeTemplate = null;
                }
            } else {
                preview.innerHTML = 'No workflow loaded';
                this.workflowModeTemplate = null;
            }
        });

        // Workflow Mode: Image preview (supports multiple)
        this.bindSafe('tg-workflow-image', 'onchange', async (e) => {
            const preview = document.getElementById('tg-workflow-image-preview');
            const countEl = document.getElementById('tg-workflow-image-count');
            const files = Array.from(e.target.files);

            if (files.length > 0) {
                preview.innerHTML = '';
                const maxPreview = Math.min(files.length, 6); // Show up to 6 previews
                for (let i = 0; i < maxPreview; i++) {
                    const b64 = await this.readFileAsBase64(files[i]);
                    const img = document.createElement('img');
                    img.src = b64;
                    img.style.cssText = 'max-width:80px; max-height:80px; border-radius:4px; object-fit:cover;';
                    preview.appendChild(img);
                }
                if (files.length > 6) {
                    const more = document.createElement('div');
                    more.style.cssText = 'display:flex; align-items:center; justify-content:center; width:80px; height:80px; background:#f0f0f0; border-radius:4px; font-size:12px; color:#666;';
                    more.textContent = `+${files.length - 6} more`;
                    preview.appendChild(more);
                }
                countEl.textContent = files.length === 1
                    ? '1 image selected (single curation)'
                    : `${files.length} images selected (batch curation — will generate ${files.length} curated workflows)`;
            } else {
                preview.innerHTML = '';
                countEl.textContent = '';
            }
        });

        this.bindSafe('run-image-analysis', 'onclick', () => this.runImageAnalysis());
        this.bindSafe('run-metadata-read', 'onclick', () => this.runMetadataExtraction());
        this.bindSafe('modal-backdrop', 'onclick', () => this.closeAllModals());

        // Lightbox Actions
        this.bindSafe('lightbox-prev', 'onclick', () => this.navigateLightbox(-1));
        this.bindSafe('lightbox-next', 'onclick', () => this.navigateLightbox(1));
        this.bindSafe('video-options-btn', 'onclick', () => {
            // Use raw base64 from batch results (avoids data URI / DOM issues)
            const b64 = this.currentBatchResults[this.currentLightboxIndex];
            if (b64) {
                const src = `data:image/png;base64,${b64}`;
                this.closeLightbox();
                this.openVideoOptions(src);
            }
        });

        this.bindSafe('scope-send-btn', 'onclick', () => {
            const b64 = this.currentBatchResults[this.currentLightboxIndex];
            if (b64) this.pushCurrentImageToScope(b64);
        });

        // Smart Video Options — multi-step workflow buttons
        this.bindSafe('svo-generate-images-btn', 'onclick', () => this.svoGenerateImages());
        this.bindSafe('svo-accept-videos-btn', 'onclick', () => this.svoGenerateVideos());

        // Batch Toggles

        this.bindSafe('image-batch-toggle', 'onchange', (e) => {
            const options = document.getElementById('image-batch-options');
            const enhanceWrapper = document.getElementById('batch-enhance-wrapper');

            if (e.target.checked) {
                if (options) options.classList.add('active');
                if (enhanceWrapper) enhanceWrapper.style.display = 'block';
                const btn = document.getElementById('run-image-gen');
                if (btn) btn.textContent = "Generate Batch";
                const input = document.getElementById('image-prompt-input');
                if (input) input.placeholder = "Enter prompts, one per line...";
            } else {
                if (options) options.classList.remove('active');
                if (enhanceWrapper) enhanceWrapper.style.display = 'none';
                const btn = document.getElementById('run-image-gen');
                if (btn) btn.textContent = "Generate Image";
                const input = document.getElementById('image-prompt-input');
                if (input) input.placeholder = "";
            }
        });

        this.bindSafe('image-batch-file', 'onchange', (e) => this.handleBatchFileSelect(e, 'image-prompt-input'));

        // Video workflow mode bar
        const VIDEO_WORKFLOW_UIS = {
            standard: 'video-std-ui',
            batch:    'video-simple-batch-ui',
            story:    'video-batch-ui',
        };
        const VIDEO_WORKFLOW_BTN_LABELS = {
            standard: 'Generate Video',
            batch:    'Run Batch',
            story:    'Run Story Workflow',
        };
        this._videoWorkflowMode = 'standard'; // tracked explicitly — don't rely on DOM class alone
        document.querySelectorAll('#video-workflow-bar .vmode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.vwf;
                this._videoWorkflowMode = mode;
                document.querySelectorAll('#video-workflow-bar .vmode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                Object.values(VIDEO_WORKFLOW_UIS).forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });
                const ui = document.getElementById(VIDEO_WORKFLOW_UIS[mode]);
                if (ui) ui.style.display = 'block';
                const runBtn = document.getElementById('run-video-gen');
                if (runBtn) runBtn.textContent = VIDEO_WORKFLOW_BTN_LABELS[mode];
            });
        });

        // Batch type sub-tabs (Text Prompts / Image Folder)
        document.querySelectorAll('#video-batch-type-bar .vmode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const btype = btn.dataset.btype;
                document.querySelectorAll('#video-batch-type-bar .vmode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('vbatch-prompts-panel').style.display = btype === 'prompts' ? 'block' : 'none';
                document.getElementById('vbatch-images-panel').style.display  = btype === 'images'  ? 'block' : 'none';
            });
        });

        // Load .txt file into prompts textarea
        this.bindSafe('video-batch-prompts-file', 'onchange', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const ta = document.getElementById('video-batch-prompts');
                if (ta) ta.value = ev.target.result.trim();
            };
            reader.readAsText(file);
        });

        // Central UI sync: called whenever mode or resolution changes
        const syncVideoModeUI = (mode) => {
            const durCtrl   = document.getElementById('video-duration-control');
            const durNote   = document.getElementById('video-duration-locked-note');
            const aspectCtrl = document.getElementById('video-aspect-control');
            const resCtrl   = document.getElementById('video-resolution-control');
            const extNote   = document.getElementById('video-extend-locked-note');
            const resVal    = document.getElementById('video-resolution-select')?.value || '720p';

            const isExtend   = mode === 'extend';
            const modeLocks8s = mode === 'interpolate' || mode === 'reference';
            const resLocks8s  = resVal === '1080p' || resVal === '4k';
            const hideDur    = isExtend || modeLocks8s || resLocks8s;

            if (durCtrl)    durCtrl.style.display    = hideDur   ? 'none'  : 'block';
            if (durNote)    durNote.style.display     = (!isExtend && (modeLocks8s || resLocks8s)) ? 'block' : 'none';
            if (aspectCtrl) aspectCtrl.style.display  = isExtend  ? 'none'  : 'block';
            if (resCtrl)    resCtrl.style.display     = isExtend  ? 'none'  : 'block';
            if (extNote)    extNote.style.display     = isExtend  ? 'block' : 'none';

            // Force the hidden select value to 8 so the backend always gets the right duration
            if (hideDur) {
                const durSel = document.getElementById('video-duration-select');
                if (durSel) durSel.value = '8';
            }

            if (isExtend) this.populateExtendRecentList();
        };

        // Video mode bar tab switching — scoped to #video-mode-bar only so it
        // doesn't clobber active state on the workflow bar or batch type bar.
        document.querySelectorAll('#video-mode-bar .vmode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                document.querySelectorAll('#video-mode-bar .vmode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.querySelectorAll('.vmode-panel').forEach(p => p.classList.remove('active'));
                const panel = document.getElementById(`vmode-panel-${btn.dataset.mode}`);
                if (panel) panel.classList.add('active');
                const lbl = document.getElementById('video-prompt-label');
                if (lbl) lbl.textContent = btn.dataset.mode === 'extend' ? 'Continuation Prompt' : 'Prompt';
                syncVideoModeUI(btn.dataset.mode);
            });
        });

        // Resolution change: recalculate duration visibility for the current mode
        this.bindSafe('video-resolution-select', 'onchange', () => {
            const mode = document.querySelector('#video-mode-bar .vmode-btn.active')?.dataset.mode || 'text';
            syncVideoModeUI(mode);
        });

        // Refresh button for recent-generations list
        this.bindSafe('video-extend-refresh-btn', 'onclick', () => this.populateExtendRecentList());

        // Model selector: update capability hint + enable/disable 3.1-only tabs
        const VIDEO_MODEL_HINTS = {
            'veo-3.1-generate-preview':      'All modes &middot; 720p, 1080p, 4K &middot; Audio',
            'veo-3.1-fast-generate-preview': 'All modes &middot; 720p, 1080p &middot; Audio &middot; Optimized for speed',
            'veo-3.1-lite-generate-preview': 'Text &amp; Image modes only &middot; 720p, 1080p &middot; Audio &middot; No Reference or Extend',
            'veo-3.0-generate-preview':      'Text &amp; Image modes only &middot; 720p, 1080p &middot; Audio &middot; No Reference or Extend',
        };
        const applyVideoModelCaps = (modelVal) => {
            const hint = document.getElementById('video-model-hint');
            if (hint) hint.innerHTML = (VIDEO_MODEL_HINTS[modelVal] || modelVal);

            const is31Full = modelVal === 'veo-3.1-generate-preview' || modelVal === 'veo-3.1-fast-generate-preview';

            // Enable/disable 3.1-exclusive mode tabs
            document.querySelectorAll('.vmode-31only').forEach(btn => {
                btn.disabled = !is31Full;
                if (!is31Full && btn.classList.contains('active')) {
                    document.querySelector('.vmode-btn[data-mode="text"]')?.click();
                }
            });

            // Gate 4K resolution to Veo 3.1 full only
            const opt4k = document.getElementById('video-res-4k-option');
            if (opt4k) {
                opt4k.disabled = !is31Full;
                // If 4K was selected and model no longer supports it, fall back to 720p
                const resSel = document.getElementById('video-resolution-select');
                if (resSel && resSel.value === '4k' && !is31Full) {
                    resSel.value = '720p';
                    const mode = document.querySelector('#video-mode-bar .vmode-btn.active')?.dataset.mode || 'text';
                    syncVideoModeUI(mode);
                }
            }
        };
        this.bindSafe('video-model-select', 'onchange', (e) => applyVideoModelCaps(e.target.value));
        // Apply on load for the default selected model
        applyVideoModelCaps(document.getElementById('video-model-select')?.value || 'veo-3.1-generate-preview');

        // Skeuomorphic Switch Logic
        const batchSwitch = document.getElementById('batch-mode-switch');
        if (batchSwitch) {
            batchSwitch.addEventListener('click', () => {
                const knob = document.getElementById('batch-mode-knob');
                const valInput = document.getElementById('batch-mode-value');
                batchSwitch.classList.toggle('active');

                if (batchSwitch.classList.contains('active')) {
                    knob.textContent = "ARTWORK MODE";
                    valInput.value = "artwork";
                } else {
                    knob.textContent = "STORY MODE";
                    valInput.value = "story";
                }
            });
        }


        // Analysis batch toggle
        this.bindSafe('analysis-batch-toggle', 'onchange', (e) => {
            const options = document.getElementById('analysis-batch-options');
            const singleInput = document.getElementById('analysis-input-image');
            const btn = document.getElementById('run-image-analysis');
            if (e.target.checked) {
                if (options) options.classList.add('active');
                if (singleInput) singleInput.parentElement.style.display = 'none';
                if (btn) btn.textContent = 'Analyze Batch';
            } else {
                if (options) options.classList.remove('active');
                if (singleInput) singleInput.parentElement.style.display = 'block';
                if (btn) btn.textContent = 'Analyze Image';
            }
        });

        // Metadata batch toggle
        this.bindSafe('metadata-batch-toggle', 'onchange', (e) => {
            const options = document.getElementById('metadata-batch-options');
            const singleInput = document.getElementById('metadata-single-input-group');
            const btn = document.getElementById('run-metadata-read');

            if (e.target.checked) {
                if (options) options.classList.add('active');
                if (singleInput) singleInput.style.display = 'none';
                if (btn) btn.textContent = 'Read Batch Metadata';
            } else {
                if (options) options.classList.remove('active');
                if (singleInput) singleInput.style.display = 'block';
                if (btn) btn.textContent = 'Read Metadata';
            }
        });

        // Smart Transform Batch Toggle
        this.bindSafe('smart-transform-batch-toggle', 'onchange', (e) => {
            const singleWrapper = document.getElementById('st-single-input-wrapper');
            const batchWrapper = document.getElementById('st-batch-input-wrapper');
            const btn = document.getElementById('run-smart-transform');

            if (e.target.checked) {
                if (singleWrapper) singleWrapper.style.display = 'none';
                if (batchWrapper) batchWrapper.style.display = 'flex';
                if (btn) btn.textContent = "Run Batch Transform";
            } else {
                if (singleWrapper) singleWrapper.style.display = 'flex';
                if (batchWrapper) batchWrapper.style.display = 'none';
                if (btn) btn.textContent = "Run Smart Transform";
            }
        });

        this.bindSafe('copy-analysis-btn', 'onclick', () => {
            const text = document.getElementById('analysis-result-text').value;
            navigator.clipboard.writeText(text);
        });

        // Stop Batch
        this.bindSafe('stop-batch-btn', 'onclick', () => {
            this.isBatchRunning = false;
            const btn = document.getElementById('stop-batch-btn');
            if (btn) btn.style.display = 'none';
        });

        this.bindSafe('retry-failed-btn', 'onclick', () => this.retryFailedBatch());

        // AI Studio Output Close
        this.bindSafe('close-studio-result', 'onclick', () => {
            const result = document.getElementById('studio-result');
            if (result) result.classList.remove('active');
            const content = document.getElementById('studio-content');
            if (content) content.innerHTML = '';
        });

        // Chat Actions
        this.bindSafe('chat-send', 'onclick', () => this.sendChatMessage());
        this.bindSafe('chat-input', 'onkeypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });

        // Hook into existing "Send to chat" button if it exists
        const existingSendToChat = document.querySelector('button.action-btn[title="Send to chat"]');
        if (existingSendToChat) {
            // Remove old listeners by cloning
            const newBtn = existingSendToChat.cloneNode(true);
            existingSendToChat.parentNode.replaceChild(newBtn, existingSendToChat);
            newBtn.className = existingSendToChat.className; // Preserve class
            newBtn.innerHTML = existingSendToChat.innerHTML; // Preserve content
            newBtn.title = "Paste to Chat Assistant";

            newBtn.onclick = () => {
                const prompt = this.getCurrentPrompt();
                this.openChatWithText(prompt);
            };
        }

        // New Image Studio Handlers
        this.bindSafe('add-ref-btn', 'onclick', () => {
            document.getElementById('image-ref-input').click();
        });

        this.bindSafe('image-ref-input', 'change', (e) => this.handleRefImageSelect(e));

        // Check API key status on startup and reflect in the Connections API button
        this.checkApiKeyStatus();
    }

    async handleRefImageSelect(e) {
        console.log("handleRefImageSelect called");
        const files = Array.from(e.target.files);
        console.log("Files selected:", files.length);
        if (!files.length) return;

        if (!this.selectedRefImages) {
            console.warn("selectedRefImages was undefined, initializing");
            this.selectedRefImages = [];
        }

        const MAX_IMAGES = 14;
        const remainingSlots = MAX_IMAGES - this.selectedRefImages.length;

        if (remainingSlots <= 0) {
            this.showToast(`Maximum ${MAX_IMAGES} images allowed.`, 'warning');
            return;
        }

        const filesToAdd = files.slice(0, remainingSlots);
        console.log("Processing files:", filesToAdd.length);

        for (const file of filesToAdd) {
            try {
                console.log("Reading file:", file.name);
                const base64 = await this.readFileAsBase64(file);
                console.log("File read success, base64 length:", base64.length);
                this.selectedRefImages.push({
                    file: file,
                    base64: base64
                });
            } catch (err) {
                console.error("Error reading file:", err);
            }
        }

        // Reset input so change event fires again for same files
        e.target.value = '';
        console.log("Calling renderRefImages, total images:", this.selectedRefImages.length);
        this.renderRefImages();
    }

    renderRefImages() {
        console.log("renderRefImages called");
        const grid = document.getElementById('ref-image-grid');
        if (!grid) {
            console.error("Grid element 'ref-image-grid' not found!");
            return;
        }

        grid.innerHTML = '';

        this.selectedRefImages.forEach((img, index) => {
            const item = document.createElement('div');
            item.className = 'ref-image-item';

            const imageEl = document.createElement('img');
            imageEl.src = img.base64;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'ref-image-remove';
            removeBtn.innerHTML = '&times;';
            removeBtn.title = 'Remove';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                this.removeRefImage(index);
            };

            item.appendChild(imageEl);
            item.appendChild(removeBtn);
            grid.appendChild(item);
        });
    }

    removeRefImage(index) {
        this.selectedRefImages.splice(index, 1);
        this.renderRefImages();
    }

    openModal(id) {
        this.closeAllModals();
        document.getElementById(id).classList.add('active');
        document.getElementById('modal-backdrop').classList.add('active');
    }

    closeAllModals() {
        document.querySelectorAll('.studio-modal').forEach(m => m.classList.remove('active'));
        document.getElementById('modal-backdrop').classList.remove('active');
    }

    openChat() {
        document.getElementById('chat-window').classList.add('active');
        document.getElementById('chat-input').focus();
    }

    openChatWithText(text) {
        this.openChat();
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.value = text || '';
            chatInput.focus();
        }
    }

    getCurrentPrompt() {
        const output = document.getElementById('output-container');
        return output ? output.textContent.trim() : '';
    }

    async enhancePrompt() {
        const promptInput = document.getElementById('image-prompt-input');
        const originalText = promptInput.value;
        if (!originalText.trim()) {
            this.showToast("Please enter a prompt to enhance.", 'warning');
            return;
        }

        const btn = document.getElementById('enhance-prompt-btn');
        btn.textContent = "Enhancing...";
        btn.disabled = true;

        try {
            const enhancementPrompt = `Optimize this image generation prompt for Gemini 3 Pro / Imagen 3. Add artistic style, lighting, and detail. Keep the original meaning. Prompt: "${originalText}"`;

            const res = await fetch('/api/generate/text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: enhancementPrompt,
                    model: 'gemini-3-flash-preview'
                })
            });

            const data = await res.json();
            if (data.status === 'success') {
                promptInput.value = data.text.trim();
            } else {
                this.showToast("Failed to enhance prompt.", 'error');
            }
        } catch (e) {
            console.error("Enhance failed", e);
            this.showToast("Error enhancing prompt: " + e.message, 'error');
        } finally {
            btn.textContent = "✨ Enhance Prompt";
            btn.disabled = false;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Smart Video Options — Multi-Step Workflow
    // Phase 0: Initialize modal, analyze reference image
    // Phase 1: Generate 5 image variations from user direction
    // Phase 2: Generate 5 videos from accepted images
    // ═══════════════════════════════════════════════════════════════

    async openVideoOptions(imgSrc) {
        // Reset state
        this.svoState = {
            sourceImageB64: null,
            analysis: null,
            prompts: [],
            images: [null, null, null, null, null],
            videos: [null, null, null, null, null],
            phase: 'init'
        };

        const modal = document.getElementById('video-options-modal');
        const loading = document.getElementById('svo-loading');
        const loadingText = document.getElementById('svo-loading-text');
        const inputSection = document.getElementById('svo-input-section');
        const imageSection = document.getElementById('svo-image-section');
        const videoSection = document.getElementById('svo-video-section');
        const promptInput = document.getElementById('svo-user-prompt');
        const generateBtn = document.getElementById('svo-generate-images-btn');
        const acceptBtn = document.getElementById('svo-accept-videos-btn');

        // Reset UI
        loading.style.display = 'block';
        loadingText.textContent = 'Analyzing reference image...';
        inputSection.style.display = 'block';
        imageSection.style.display = 'none';
        videoSection.style.display = 'none';
        acceptBtn.style.display = 'none';
        promptInput.value = '';
        promptInput.disabled = true;
        generateBtn.disabled = true;
        document.getElementById('svo-image-grid').innerHTML = '';
        document.getElementById('svo-video-grid').innerHTML = '';

        // Show modal
        modal.classList.add('active');
        document.getElementById('modal-backdrop').classList.add('active');

        try {
            // Normalize image to base64
            let imageBase64 = imgSrc;
            if (this.isUrl(imgSrc)) {
                try {
                    const resp = await fetch(imgSrc);
                    const blob = await resp.blob();
                    imageBase64 = await this.readFileAsBase64(blob);
                } catch (e) {
                    console.error("Failed to fetch image source", e);
                    throw new Error("Could not load source image.");
                }
            }

            // Strip data URI prefix for storage (keep raw base64)
            let rawB64 = imageBase64;
            if (rawB64.includes(',')) {
                rawB64 = rawB64.split(',')[1];
            }
            this.svoState.sourceImageB64 = rawB64;
            document.getElementById('svo-source-image').value = rawB64;

            // Show reference preview
            const preview = document.getElementById('svo-reference-preview');
            preview.innerHTML = `<img src="data:image/png;base64,${rawB64}" style="width:100%; height:100%; object-fit:cover;">`;

            // Analyze image
            const analysisRes = await fetch('/api/analyze/image-to-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: rawB64 })
            });

            if (!analysisRes.ok) {
                const errData = await analysisRes.json().catch(() => ({}));
                throw new Error(errData.detail || 'Image analysis failed');
            }

            const analysisData = await analysisRes.json();
            if (!analysisData.analysis) throw new Error("No analysis returned");

            this.svoState.analysis = analysisData.analysis;
            document.getElementById('svo-analysis').value = analysisData.analysis;

            // Enable prompt input and generate button
            loading.style.display = 'none';
            promptInput.disabled = false;
            generateBtn.disabled = false;
            promptInput.focus();

        } catch (e) {
            console.error('SVO init error:', e);
            loading.style.display = 'block';
            loadingText.innerHTML = `<span style="color:#d32f2f;">Failed: ${e.message}</span>`;
        }
    }

    async svoGenerateImages() {
        const promptInput = document.getElementById('svo-user-prompt');
        const userDirection = promptInput.value.trim();
        if (!userDirection) {
            this.showToast('Please enter your creative direction first.', 'error');
            promptInput.focus();
            return;
        }

        const loading = document.getElementById('svo-loading');
        const loadingText = document.getElementById('svo-loading-text');
        const imageSection = document.getElementById('svo-image-section');
        const imageGrid = document.getElementById('svo-image-grid');
        const generateBtn = document.getElementById('svo-generate-images-btn');
        const acceptBtn = document.getElementById('svo-accept-videos-btn');

        // Disable generate button while working
        generateBtn.disabled = true;
        generateBtn.textContent = '⏳ Generating...';
        loading.style.display = 'block';
        loadingText.textContent = 'Creating variation prompts...';
        imageSection.style.display = 'block';
        imageGrid.innerHTML = '';
        acceptBtn.style.display = 'none';

        // Hide video section if re-generating
        document.getElementById('svo-video-section').style.display = 'none';

        try {
            // Step 1: Get 5 variation prompts from LLM
            const promptRes = await fetch('/api/generate/image-variation-prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_direction: userDirection,
                    image_analysis: this.svoState.analysis
                })
            });

            if (!promptRes.ok) {
                const errData = await promptRes.json().catch(() => ({}));
                throw new Error(errData.detail || 'Failed to generate variation prompts');
            }

            const promptData = await promptRes.json();
            this.svoState.prompts = promptData.prompts;
            this.svoState.images = [null, null, null, null, null];
            this.svoState.phase = 'images';

            loadingText.textContent = 'Generating images...';

            // Step 2: Create 5 placeholder boxes
            for (let i = 0; i < 5; i++) {
                const p = this.svoState.prompts[i];
                const slot = document.createElement('div');
                slot.id = `svo-img-slot-${i}`;
                slot.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:6px;';
                slot.innerHTML = `
                    <div id="svo-img-box-${i}" style="width:100%; aspect-ratio:1; background:#f5f5f5; border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden; border:2px solid #e0e0e0;">
                        <span class="loader" style="width:24px; height:24px; border-width:2px; margin-bottom:8px;"></span>
                        <span style="font-size:10px; color:#999; text-align:center; padding:0 4px;">Generating...</span>
                    </div>
                    <p style="font-size:11px; font-weight:600; color:#333; margin:0; text-align:center; line-height:1.3;">${p.label}</p>
                `;
                imageGrid.appendChild(slot);
            }

            // Step 3: Generate 5 images in parallel
            const imagePromises = this.svoState.prompts.map((p, i) => {
                return fetch('/api/generate/image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: p.prompt,
                        model: 'gemini-3.1-flash-image-preview',
                        input_images: [this.svoState.sourceImageB64],
                        aspect_ratio: document.getElementById('svo-image-aspect').value
                    })
                })
                .then(async res => {
                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.detail || `Image ${i + 1} failed`);
                    }
                    return res.json();
                })
                .then(data => {
                    // Success — update slot
                    this.svoState.images[i] = data.image;
                    this._svoRenderImageSlot(i, data.image);
                })
                .catch(err => {
                    console.error(`SVO image ${i} failed:`, err);
                    this._svoRenderImageError(i, err.message);
                });
            });

            await Promise.allSettled(imagePromises);

            // Done generating — show accept button and re-enable generate
            loading.style.display = 'none';
            generateBtn.disabled = false;
            generateBtn.textContent = '✨ Regenerate All';
            acceptBtn.style.display = 'block';

        } catch (e) {
            console.error('SVO generate images error:', e);
            loading.style.display = 'block';
            loadingText.innerHTML = `<span style="color:#d32f2f;">${e.message}</span>`;
            generateBtn.disabled = false;
            generateBtn.textContent = '✨ Generate 5 Variations';
        }
    }

    _svoRenderImageSlot(index, imageB64) {
        const box = document.getElementById(`svo-img-box-${index}`);
        if (!box) return;
        box.style.border = '2px solid #4CAF50';
        box.innerHTML = `
            <img src="data:image/png;base64,${imageB64}" style="width:100%; height:100%; object-fit:cover; cursor:pointer;" onclick="window.studioIntegrationInstance._svoPreviewImage(${index})">
        `;
        // Add refresh button below the box
        const slot = document.getElementById(`svo-img-slot-${index}`);
        // Remove old refresh btn if re-rendering
        const oldBtn = slot.querySelector('.svo-refresh-btn');
        if (oldBtn) oldBtn.remove();
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'svo-refresh-btn';
        refreshBtn.textContent = '🔄';
        refreshBtn.title = 'Regenerate this variation';
        refreshBtn.style.cssText = 'background:none; border:1px solid #ddd; border-radius:4px; padding:2px 8px; cursor:pointer; font-size:14px;';
        refreshBtn.onclick = () => window.studioIntegrationInstance.svoRefreshImage(index);
        // Insert after the image box, before the label
        const label = slot.querySelector('p');
        slot.insertBefore(refreshBtn, label);
    }

    _svoRenderImageError(index, message) {
        const box = document.getElementById(`svo-img-box-${index}`);
        if (!box) return;
        box.style.border = '2px solid #d32f2f';
        box.innerHTML = `
            <div style="color:#d32f2f; font-size:10px; text-align:center; padding:8px;">
                Failed<br><span style="color:#999;">${message.substring(0, 60)}</span>
            </div>
        `;
        // Add retry button
        const slot = document.getElementById(`svo-img-slot-${index}`);
        const oldBtn = slot.querySelector('.svo-refresh-btn');
        if (oldBtn) oldBtn.remove();
        const retryBtn = document.createElement('button');
        retryBtn.className = 'svo-refresh-btn';
        retryBtn.textContent = '🔄 Retry';
        retryBtn.style.cssText = 'background:none; border:1px solid #d32f2f; border-radius:4px; padding:2px 8px; cursor:pointer; font-size:11px; color:#d32f2f;';
        retryBtn.onclick = () => window.studioIntegrationInstance.svoRefreshImage(index);
        const label = slot.querySelector('p');
        slot.insertBefore(retryBtn, label);
    }

    _svoPreviewImage(index) {
        const imgB64 = this.svoState.images[index];
        if (!imgB64) return;
        // Quick preview using lightbox
        this.currentBatchResults = this.svoState.images.filter(img => img !== null);
        const filteredIndex = this.svoState.images.slice(0, index + 1).filter(img => img !== null).length - 1;
        this.openLightbox(filteredIndex);
    }

    async svoRefreshImage(index) {
        const prompt = this.svoState.prompts[index];
        if (!prompt) return;

        // Show loading in the slot
        const box = document.getElementById(`svo-img-box-${index}`);
        if (box) {
            box.style.border = '2px solid #e0e0e0';
            box.innerHTML = `
                <span class="loader" style="width:24px; height:24px; border-width:2px; margin-bottom:8px;"></span>
                <span style="font-size:10px; color:#999;">Regenerating...</span>
            `;
        }

        // Remove refresh button while generating
        const slot = document.getElementById(`svo-img-slot-${index}`);
        const oldBtn = slot?.querySelector('.svo-refresh-btn');
        if (oldBtn) oldBtn.remove();

        try {
            const res = await fetch('/api/generate/image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt.prompt,
                    model: 'gemini-3.1-flash-image-preview',
                    input_images: [this.svoState.sourceImageB64],
                    aspect_ratio: document.getElementById('svo-image-aspect').value
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || 'Regeneration failed');
            }

            const data = await res.json();
            this.svoState.images[index] = data.image;
            this._svoRenderImageSlot(index, data.image);
        } catch (e) {
            console.error(`SVO refresh image ${index} failed:`, e);
            this._svoRenderImageError(index, e.message);
        }
    }

    async svoGenerateVideos() {
        const videoSection = document.getElementById('svo-video-section');
        const videoGrid = document.getElementById('svo-video-grid');
        const acceptBtn = document.getElementById('svo-accept-videos-btn');
        const loading = document.getElementById('svo-loading');
        const loadingText = document.getElementById('svo-loading-text');

        // Collect successfully generated images
        const validIndices = [];
        for (let i = 0; i < 5; i++) {
            if (this.svoState.images[i]) validIndices.push(i);
        }

        if (validIndices.length === 0) {
            this.showToast('No images to create videos from. Please generate images first.', 'error');
            return;
        }

        this.svoState.phase = 'videos';
        this.svoState.videos = [null, null, null, null, null];
        acceptBtn.style.display = 'none';
        videoSection.style.display = 'block';
        videoGrid.innerHTML = '';
        loading.style.display = 'block';
        loadingText.textContent = `Generating ${validIndices.length} videos...`;

        // Create placeholder slots for each valid image
        const vidAspect = document.getElementById('svo-video-aspect').value.replace(':', '/');
        for (const i of validIndices) {
            const p = this.svoState.prompts[i];
            const slot = document.createElement('div');
            slot.id = `svo-vid-slot-${i}`;
            slot.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:6px;';
            slot.innerHTML = `
                <div id="svo-vid-box-${i}" style="width:100%; aspect-ratio:${vidAspect}; background:#f5f5f5; border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden; border:2px solid #e0e0e0;">
                    <span class="loader" style="width:24px; height:24px; border-width:2px; margin-bottom:8px;"></span>
                    <span style="font-size:10px; color:#999; text-align:center;">Generating video...</span>
                </div>
                <p style="font-size:11px; font-weight:600; color:#333; margin:0; text-align:center;">${p.label}</p>
            `;
            videoGrid.appendChild(slot);
        }

        // Generate videos sequentially (Veo is heavy)
        for (let idx = 0; idx < validIndices.length; idx++) {
            const i = validIndices[idx];
            const p = this.svoState.prompts[i];
            loadingText.textContent = `Generating video ${idx + 1} of ${validIndices.length}...`;

            try {
                const fullPrompt = `${p.prompt}. Scene context: ${this.svoState.analysis.substring(0, 200)}`;

                const res = await fetch('/api/generate/video', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: fullPrompt,
                        model: 'veo-3.1-generate-preview',
                        aspect_ratio: document.getElementById('svo-video-aspect').value,
                        duration: 4,
                        start_frame_image: this.svoState.images[i]
                    })
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.detail || `Video ${i + 1} failed`);
                }

                const data = await res.json();
                this.svoState.videos[i] = data.video;
                this._svoRenderVideoSlot(i, data.video, p.label);

            } catch (e) {
                console.error(`SVO video ${i} failed:`, e);
                this._svoRenderVideoError(i, e.message);
            }
        }

        loading.style.display = 'none';

        // Show "Export Combined" button if 2+ videos succeeded
        const successCount = this.svoState.videos.filter(v => v !== null).length;
        if (successCount >= 2) {
            let combineBtn = document.getElementById('svo-combine-btn');
            if (!combineBtn) {
                combineBtn = document.createElement('button');
                combineBtn.id = 'svo-combine-btn';
                combineBtn.className = 'studio-btn-primary';
                combineBtn.style.cssText = 'width:100%; margin-top:12px; background:#1976D2;';
                combineBtn.textContent = '🎞️ Export Combined Video';
                combineBtn.onclick = () => window.studioIntegrationInstance.svoCombineVideos();
                videoSection.appendChild(combineBtn);
            }
            combineBtn.style.display = 'block';
            combineBtn.disabled = false;
            combineBtn.textContent = '🎞️ Export Combined Video';
        }
    }

    _svoRenderVideoSlot(index, videoB64, label) {
        const box = document.getElementById(`svo-vid-box-${index}`);
        if (!box) return;
        box.style.border = '2px solid #4CAF50';
        box.innerHTML = `
            <video controls autoplay loop muted style="width:100%; height:100%; object-fit:cover; border-radius:6px;">
                <source src="data:video/mp4;base64,${videoB64}" type="video/mp4">
            </video>
        `;
        // Add refresh + download buttons
        const slot = document.getElementById(`svo-vid-slot-${index}`);
        // Remove old controls if re-rendering
        const oldControls = slot.querySelector('.svo-vid-controls');
        if (oldControls) oldControls.remove();

        const controls = document.createElement('div');
        controls.className = 'svo-vid-controls';
        controls.style.cssText = 'display:flex; gap:6px; align-items:center;';

        const refreshBtn = document.createElement('button');
        refreshBtn.textContent = '🔄';
        refreshBtn.title = 'Regenerate this video';
        refreshBtn.style.cssText = 'background:none; border:1px solid #ddd; border-radius:4px; padding:2px 8px; cursor:pointer; font-size:14px;';
        refreshBtn.onclick = () => window.studioIntegrationInstance.svoRefreshVideo(index);

        const dlLink = document.createElement('a');
        dlLink.href = `data:video/mp4;base64,${videoB64}`;
        dlLink.download = `svo_${(label || 'video').toLowerCase().replace(/\s+/g, '_')}_${index + 1}.mp4`;
        dlLink.textContent = '⬇️';
        dlLink.title = 'Download video';
        dlLink.style.cssText = 'font-size:14px; text-decoration:none; border:1px solid #ddd; border-radius:4px; padding:2px 8px;';

        controls.appendChild(refreshBtn);
        controls.appendChild(dlLink);
        const labelEl = slot.querySelector('p');
        slot.insertBefore(controls, labelEl);
    }

    _svoRenderVideoError(index, message) {
        const box = document.getElementById(`svo-vid-box-${index}`);
        if (!box) return;
        box.style.border = '2px solid #d32f2f';
        box.innerHTML = `
            <div style="color:#d32f2f; font-size:10px; text-align:center; padding:8px;">
                Failed<br><span style="color:#999;">${message.substring(0, 80)}</span>
            </div>
        `;
        const slot = document.getElementById(`svo-vid-slot-${index}`);
        const oldControls = slot.querySelector('.svo-vid-controls');
        if (oldControls) oldControls.remove();

        const retryBtn = document.createElement('button');
        retryBtn.className = 'svo-vid-controls';
        retryBtn.textContent = '🔄 Retry';
        retryBtn.style.cssText = 'background:none; border:1px solid #d32f2f; border-radius:4px; padding:2px 8px; cursor:pointer; font-size:11px; color:#d32f2f;';
        retryBtn.onclick = () => window.studioIntegrationInstance.svoRefreshVideo(index);
        const labelEl = slot.querySelector('p');
        slot.insertBefore(retryBtn, labelEl);
    }

    async svoRefreshVideo(index) {
        const p = this.svoState.prompts[index];
        const imgB64 = this.svoState.images[index];
        if (!p || !imgB64) return;

        const box = document.getElementById(`svo-vid-box-${index}`);
        if (box) {
            box.style.border = '2px solid #e0e0e0';
            box.innerHTML = `
                <span class="loader" style="width:24px; height:24px; border-width:2px; margin-bottom:8px;"></span>
                <span style="font-size:10px; color:#999;">Regenerating...</span>
            `;
        }

        const slot = document.getElementById(`svo-vid-slot-${index}`);
        const oldControls = slot?.querySelector('.svo-vid-controls');
        if (oldControls) oldControls.remove();

        try {
            const fullPrompt = `${p.prompt}. Scene context: ${this.svoState.analysis.substring(0, 200)}`;

            const res = await fetch('/api/generate/video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: fullPrompt,
                    model: 'veo-3.1-generate-preview',
                    aspect_ratio: document.getElementById('svo-video-aspect').value,
                    duration: 4,
                    start_frame_image: imgB64
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || 'Video regeneration failed');
            }

            const data = await res.json();
            this.svoState.videos[index] = data.video;
            this._svoRenderVideoSlot(index, data.video, p.label);
        } catch (e) {
            console.error(`SVO refresh video ${index} failed:`, e);
            this._svoRenderVideoError(index, e.message);
        }
    }

    async svoCombineVideos() {
        const combineBtn = document.getElementById('svo-combine-btn');
        if (combineBtn) {
            combineBtn.disabled = true;
            combineBtn.textContent = '⏳ Combining videos...';
        }

        // Collect all successful videos in order
        const videos = this.svoState.videos.filter(v => v !== null);
        if (videos.length < 2) {
            this.showToast('Need at least 2 videos to combine.', 'error');
            if (combineBtn) {
                combineBtn.disabled = false;
                combineBtn.textContent = '🎞️ Export Combined Video';
            }
            return;
        }

        try {
            const res = await fetch('/api/video/combine', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videos })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || 'Combine failed');
            }

            const data = await res.json();

            // Trigger download
            const a = document.createElement('a');
            a.href = `data:video/mp4;base64,${data.video}`;
            a.download = `svo_combined_${Date.now()}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            if (combineBtn) {
                combineBtn.disabled = false;
                combineBtn.textContent = '🎞️ Export Combined Video';
            }
            this.showToast('Combined video downloaded!', 'success');
        } catch (e) {
            console.error('SVO combine failed:', e);
            this.showToast(`Combine failed: ${e.message}`, 'error');
            if (combineBtn) {
                combineBtn.disabled = false;
                combineBtn.textContent = '🎞️ Export Combined Video';
            }
        }
    }

    openVideoOptionsFromResult(index) {
        const b64 = this.currentBatchResults[index];
        if (b64) {
            this.openVideoOptions(`data:image/png;base64,${b64}`);
        }
    }

    async pushCurrentImageToScope(b64) {
        const scopeVideo = window.synthSmall?.scopeVideo;
        if (!scopeVideo) {
            this.showToast('Scope video client not available.', 'error', 3000);
            return;
        }
        this.showToast('Sending to Scope…', 'info', 2000);
        const path = await scopeVideo.pushImageToScope(b64);
        if (path) {
            this.showToast(`✅ Sent to Scope: ${path}`, 'success', 4000);
        } else {
            this.showToast('❌ Failed to send image to Scope. Is Scope running?', 'error', 4000);
        }
    }

    isUrl(str) {
        return typeof str === 'string' && (str.startsWith('http') || str.startsWith('blob:'));
    }

    async fetchEnhancedText(text) {
        const enhancementPrompt = `Transform this image generation keyword list into a rich, descriptive narrative paragraph suitable for Gemini 3 Pro image generation. Keep the core concept but enhance with atmospheric details, lighting, composition, and style. Original keywords: "${text}"`;

        const res = await fetch('/api/generate/text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: enhancementPrompt,
                model: 'gemini-3-flash-preview'
            })
        });

        if (!res.ok) {
            throw new Error(`Enhancement API failed: ${res.status}`);
        }

        const data = await res.json();
        if (data.status === 'success') {
            return data.text.trim();
        }
        throw new Error("Failed to enhance text");
    }

    async generateVideo() {
        const wfMode = this._videoWorkflowMode || 'standard';

        if (wfMode === 'story') {
            await this.runBatchStoryWorkflow();
            return;
        }
        if (wfMode === 'batch') {
            await this.runSimpleBatchWorkflow();
            return;
        }

        const prompt = document.getElementById('video-prompt-input').value;
        if (!prompt) { this.showToast("Please enter a prompt.", 'warning'); return; }

        // Validation for first/last frames
        const firstFrame = document.getElementById('video-first-frame-input');
        const lastFrame = document.getElementById('video-last-frame-input');
        const duration = document.getElementById('video-duration-select').value;

        // Validate last frame requirements
        if (lastFrame.files.length > 0 && duration !== "8") {
            this.showToast("Last frame interpolation requires 8-second duration. Please select '8 Seconds' from the Duration dropdown.", 'warning', 5000);
            return;
        }

        this.closeAllModals();
        this.showLoading("Video");

        try {
            const params = {
                prompt: prompt,
                model: document.getElementById('video-model-select').value,
                duration: document.getElementById('video-duration-select').value,
                aspect_ratio: document.getElementById('video-aspect-select').value
            };

            // Handle Ref Images - REMOVED (Legacy/Unsupported by Veo endpoint directly)
            // const refInput = document.getElementById('video-ref-input');
            // if (refInput && refInput.files.length) { ... }

            // First/Last Frames with user feedback
            if (firstFrame.files.length) {
                params.start_frame_image = await this.readFileAsBase64(firstFrame.files[0]);
                console.log("✓ First frame selected and will be used as the starting frame");
            }

            if (lastFrame.files.length) {
                params.end_frame_image = await this.readFileAsBase64(lastFrame.files[0]);
                console.log("✓ Last frame selected and will be used for interpolation");
            }

            const endpoint = '/api/generate/video';
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });

            if (!res.ok) throw new Error((await res.json()).detail || "Req failed");

            const data = await res.json();
            if (data.status === 'success') {
                const content = document.getElementById('studio-content');
                content.innerHTML = `
                    <div style="text-align:center;">
                        <video controls autoplay loop style="max-width:100%; max-height:80vh; border-radius:8px; box-shadow:0 10px 30px rgba(0,0,0,0.3);">
                            <source src="data:video/mp4;base64,${data.video}" type="video/mp4">
                            Your browser does not support the video tag.
                        </video>
                        <div style="margin-top:15px; display:flex; justify-content:center; gap:10px;">
                            <a href="data:video/mp4;base64,${data.video}" download="video_${Date.now()}.mp4" class="studio-btn-primary" style="text-decoration:none;">Download Video</a>
                        </div>
                    </div>
                `;
                const closeBtn = document.getElementById('close-studio-result');
                if (closeBtn) closeBtn.style.display = 'block';
            } else {
                throw new Error(data.detail || "Video gen failed");
            }
        } catch (e) {
            this.showError(e.message);
        }
    }


    async runSimpleBatchWorkflow() {
        if (this.isBatchRunning) { this.showToast("A batch is already running.", 'warning'); return; }

        const activeBtypeBtn = document.querySelector('#video-batch-type-bar .vmode-btn.active');
        const btype = activeBtypeBtn ? activeBtypeBtn.dataset.btype : 'prompts';

        const modelSelect    = document.getElementById('video-model-select');
        const aspectSelect   = document.getElementById('video-aspect-select');
        const durationSelect = document.getElementById('video-duration-select');
        const model       = modelSelect    ? modelSelect.value    : 'veo-3.1-generate-preview';
        const aspectRatio = aspectSelect   ? aspectSelect.value   : '16:9';
        const duration    = parseInt(durationSelect ? durationSelect.value : '4', 10);

        let jobs = []; // { prompt, imageB64 (optional), label }

        if (btype === 'prompts') {
            const ta = document.getElementById('video-batch-prompts');
            const lines = (ta ? ta.value : '').split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length === 0) { this.showToast("Enter at least one prompt.", 'warning'); return; }
            jobs = lines.map((prompt, i) => ({ prompt, label: `Prompt ${i + 1}` }));
        } else {
            const fileInput = document.getElementById('video-batch-images');
            const files = fileInput ? Array.from(fileInput.files) : [];
            if (files.length === 0) { this.showToast("Select at least one image.", 'warning'); return; }
            const sharedPrompt = (document.getElementById('video-batch-shared-prompt')?.value || '').trim()
                                 || 'Animate this image cinematically.';
            // Store file references only — base64 is read lazily in the loop so the
            // modal can close and the grid can appear immediately.
            jobs = Array.from(files).map(f => ({ prompt: sharedPrompt, file: f, label: f.name }));
        }

        this.closeAllModals(); // Show result UI right away — no blocking reads before this

        const resultContainer = document.getElementById('studio-result');
        const contentDiv      = document.getElementById('studio-result-content') || document.getElementById('studio-content');
        const stopBtn         = document.getElementById('stop-batch-btn');
        const closeBtn        = document.getElementById('close-studio-result');

        resultContainer.classList.add('active');
        if (stopBtn)  stopBtn.style.display  = 'inline-block';
        if (closeBtn) closeBtn.style.display = 'none';

        contentDiv.innerHTML = '<div class="studio-result-grid" id="batch-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));"></div>';
        const grid = document.getElementById('batch-grid');

        const ratioStyle = aspectRatio === '9:16' ? 'aspect-ratio:9/16;' : 'aspect-ratio:16/9;';
        const items = jobs.map((job, i) => {
            const item = document.createElement('div');
            item.className = 'studio-result-item';
            item.innerHTML = `
                <div style="${ratioStyle} background:#f0f0f0; display:flex; align-items:center; justify-content:center; border-radius:4px; overflow:hidden;">
                    <span class="loader" style="width:20px; height:20px;"></span>
                </div>
                <p style="font-size:11px; margin-top:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${job.label}">${job.label}</p>
            `;
            grid.appendChild(item);
            return item;
        });

        const concurrency = parseInt(document.getElementById('video-batch-concurrency')?.value || '3', 10);
        this._retriableJobs = []; // reset retry list
        this.isBatchRunning = true;
        let succeeded = 0, failed = 0;

        // Per-item processor — called concurrently by the worker pool
        const processItem = async (i) => {
            const job  = jobs[i];
            const item = items[i];
            item.querySelector('p').textContent = `Generating ${i + 1}/${jobs.length}…`;

            const params = { prompt: job.prompt, model, aspect_ratio: aspectRatio, duration };
            if (job.file && !job.imageB64) {
                job.imageB64 = await this.readFileAsBase64(job.file);
            }
            if (job.imageB64) params.start_frame_image = job.imageB64;

            try {
                const res = await fetch('/api/generate/video', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(params)
                });
                if (!res.ok) {
                    const errData = await res.json().catch(() => null);
                    throw new Error(errData?.detail || `HTTP ${res.status}`);
                }
                const data = await res.json();

                item.querySelector('div').innerHTML = `
                    <video controls autoplay loop muted style="width:100%; height:100%; object-fit:cover;">
                        <source src="data:video/mp4;base64,${data.video}" type="video/mp4">
                    </video>
                `;
                item.querySelector('p').textContent = job.label;
                const dlLink = document.createElement('a');
                dlLink.href = `data:video/mp4;base64,${data.video}`;
                dlLink.download = `batch_clip_${i + 1}.mp4`;
                dlLink.textContent = '⬇️';
                dlLink.style.cssText = 'display:block; text-align:center; text-decoration:none; margin-top:2px;';
                item.appendChild(dlLink);
                succeeded++;

            } catch (itemErr) {
                console.error(`Batch item ${i + 1} failed:`, itemErr);
                item.querySelector('div').innerHTML = `
                    <div style="${ratioStyle} background:#fff0f0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:8px; border-radius:4px;">
                        <span style="font-size:18px;">⚠️</span>
                        <span style="font-size:10px; color:#c00; text-align:center; margin-top:4px; word-break:break-word;">${itemErr.message.slice(0, 120)}</span>
                    </div>
                `;
                item.querySelector('p').textContent = `${job.label} — failed`;
                failed++;
                this._retriableJobs.push({ job, item, ratioStyle });
            }
        };

        try {
            // Worker pool: N workers each pull from a shared index queue
            const queue = jobs.map((_, i) => i);
            const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
                while (this.isBatchRunning) {
                    const i = queue.shift();
                    if (i === undefined) break;
                    await processItem(i);
                }
            });
            await Promise.all(workers);
        } finally {
            this.isBatchRunning = false;
            if (stopBtn) stopBtn.style.display = 'none';
            if (closeBtn) closeBtn.style.display = 'block';

            const retryBtn = document.getElementById('retry-failed-btn');
            if (retryBtn) {
                if (this._retriableJobs.length > 0) {
                    retryBtn.textContent = `Retry Failed (${this._retriableJobs.length})`;
                    retryBtn.style.display = 'inline-block';
                } else {
                    retryBtn.style.display = 'none';
                }
            }
            this.showToast(`Batch complete: ${succeeded} succeeded, ${failed} failed.`, failed > 0 ? 'warning' : 'success');
        }
    }

    async retryFailedBatch() {
        if (this.isBatchRunning) { this.showToast("A batch is already running.", 'warning'); return; }
        if (!this._retriableJobs?.length) { this.showToast("No failed items to retry.", 'warning'); return; }

        const retryBtn  = document.getElementById('retry-failed-btn');
        const stopBtn   = document.getElementById('stop-batch-btn');
        const closeBtn  = document.getElementById('close-studio-result');

        const jobs = this._retriableJobs;
        this._retriableJobs = [];
        if (retryBtn)  retryBtn.style.display  = 'none';
        if (stopBtn)   stopBtn.style.display   = 'inline-block';
        if (closeBtn)  closeBtn.style.display  = 'none';

        // Reset each failed item back to a loading placeholder
        jobs.forEach(({ item, ratioStyle }) => {
            item.querySelector('div').innerHTML = `
                <div style="${ratioStyle} background:#f0f0f0; display:flex; align-items:center; justify-content:center; border-radius:4px; overflow:hidden;">
                    <span class="loader" style="width:20px; height:20px;"></span>
                </div>
            `;
            item.querySelector('p').textContent = '…';
        });

        const concurrency = parseInt(document.getElementById('video-batch-concurrency')?.value || '3', 10);
        // Read shared params from the modal controls (still valid — modal is closed but DOM persists)
        const model       = document.getElementById('video-model-select')?.value       || 'veo-3.1-generate-preview';
        const aspectRatio = document.getElementById('video-aspect-select')?.value      || '16:9';
        const duration    = parseInt(document.getElementById('video-duration-select')?.value || '4', 10);

        this.isBatchRunning = true;
        let succeeded = 0, failed = 0;

        const queue = jobs.map((_, i) => i);
        const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
            while (this.isBatchRunning) {
                const i = queue.shift();
                if (i === undefined) break;
                const { job, item, ratioStyle } = jobs[i];
                item.querySelector('p').textContent = `Retrying ${job.label}…`;

                const params = { prompt: job.prompt, model, aspect_ratio: aspectRatio, duration };
                if (job.file && !job.imageB64) job.imageB64 = await this.readFileAsBase64(job.file);
                if (job.imageB64) params.start_frame_image = job.imageB64;

                try {
                    const res = await fetch('/api/generate/video', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(params)
                    });
                    if (!res.ok) {
                        const errData = await res.json().catch(() => null);
                        throw new Error(errData?.detail || `HTTP ${res.status}`);
                    }
                    const data = await res.json();
                    item.querySelector('div').innerHTML = `
                        <video controls autoplay loop muted style="width:100%; height:100%; object-fit:cover;">
                            <source src="data:video/mp4;base64,${data.video}" type="video/mp4">
                        </video>
                    `;
                    item.querySelector('p').textContent = job.label;
                    const dlLink = document.createElement('a');
                    dlLink.href = `data:video/mp4;base64,${data.video}`;
                    dlLink.download = `retry_${job.label}.mp4`;
                    dlLink.textContent = '⬇️';
                    dlLink.style.cssText = 'display:block; text-align:center; text-decoration:none; margin-top:2px;';
                    item.appendChild(dlLink);
                    succeeded++;
                } catch (itemErr) {
                    console.error(`Retry failed for ${job.label}:`, itemErr);
                    item.querySelector('div').innerHTML = `
                        <div style="${ratioStyle} background:#fff0f0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:8px; border-radius:4px;">
                            <span style="font-size:18px;">⚠️</span>
                            <span style="font-size:10px; color:#c00; text-align:center; margin-top:4px; word-break:break-word;">${itemErr.message.slice(0, 120)}</span>
                        </div>
                    `;
                    item.querySelector('p').textContent = `${job.label} — failed`;
                    failed++;
                    this._retriableJobs.push({ job, item, ratioStyle });
                }
            }
        });
        await Promise.all(workers);

        this.isBatchRunning = false;
        if (stopBtn)  stopBtn.style.display  = 'none';
        if (closeBtn) closeBtn.style.display = 'block';
        if (retryBtn) {
            if (this._retriableJobs.length > 0) {
                retryBtn.textContent = `Retry Failed (${this._retriableJobs.length})`;
                retryBtn.style.display = 'inline-block';
            } else {
                retryBtn.style.display = 'none';
            }
        }
        this.showToast(`Retry complete: ${succeeded} recovered, ${failed} still failed.`, failed > 0 ? 'warning' : 'success');
    }

    async runBatchStoryWorkflow() {
        if (this.isBatchRunning) { this.showToast("A batch is already running.", 'warning'); return; }

        const modeInput = document.getElementById('batch-mode-value');
        const promptInput = document.getElementById('video-north-star');
        const fileInput = document.getElementById('video-batch-input');

        // Capture User Options
        const modelSelect = document.getElementById('video-model-select');
        const aspectSelect = document.getElementById('video-aspect-select');
        const durationSelect = document.getElementById('video-duration-select');

        const selectedModel = modelSelect ? modelSelect.value : 'veo-3.1-generate-preview';
        const selectedAspectRatio = aspectSelect ? aspectSelect.value : '16:9';
        const selectedDuration = durationSelect ? durationSelect.value : '5';

        const mode = modeInput ? modeInput.value : 'story';
        const userPrompt = promptInput ? promptInput.value : '';
        const files = fileInput ? Array.from(fileInput.files) : [];

        if (files.length === 0) { this.showToast("Please select images for the batch.", 'warning'); return; }
        if (files.length > 12) { this.showToast("Max 12 images allowed.", 'warning'); return; }
        if (!userPrompt) { this.showToast("Please provide a North Star prompt to guide the AI.", 'warning'); return; }

        this.closeAllModals();

        // Setup Result UI
        const resultContainer = document.getElementById('studio-result');
        const contentDiv = document.getElementById('studio-result-content') || document.getElementById('studio-content');
        const stopBtn = document.getElementById('stop-batch-btn');
        const closeBtn = document.getElementById('close-studio-result');

        resultContainer.classList.add('active');
        if (stopBtn) stopBtn.style.display = 'inline-block';
        if (closeBtn) closeBtn.style.display = 'none';

        contentDiv.innerHTML = '<div class="studio-result-grid" id="batch-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));"></div>';
        const grid = document.getElementById('batch-grid');

        // Create placeholders
        const items = [];
        files.forEach((f, i) => {
            const item = document.createElement('div');
            item.className = 'studio-result-item';
            // Adjust aspect ratio of placeholder to match selection
            const ratioStyle = selectedAspectRatio === '9:16' ? 'aspect-ratio:9/16;' : 'aspect-ratio:16/9;';
            item.innerHTML = `
                <div style="${ratioStyle} background:#f0f0f0; display:flex; align-items:center; justify-content:center; border-radius:4px; overflow:hidden;">
                    <span class="loader" style="width:20px; height:20px;"></span>
                </div>
                <p style="font-size:11px; margin-top:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Image ${i + 1}</p>
                <details style="margin-top:4px; font-size:10px;">
                    <summary style="cursor:pointer; color:#888;">Details</summary>
                    <p class="detail-analysis" style="margin:4px 0; color:#666; word-break:break-word; white-space:normal;"></p>
                    <p class="detail-prompt" style="margin:4px 0; color:#444; word-break:break-word; white-space:normal; font-style:italic;"></p>
                </details>
            `;
            grid.appendChild(item);
            items.push(item);
        });

        this.isBatchRunning = true;

        try {
            // --- STEP 1: ANALYZE ---
            const descriptions = [];
            const originalBase64s = [];

            for (let i = 0; i < files.length; i++) {
                if (!this.isBatchRunning) throw new Error("Stopped by user");
                items[i].querySelector('p').textContent = `Analyzing ${i + 1}/${files.length}...`;

                const b64 = await this.readFileAsBase64(files[i]);
                originalBase64s.push(b64);

                const res = await fetch('/api/analyze/image-to-prompt', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: b64 })
                });

                if (!res.ok) {
                    throw new Error(`Analysis failed for image ${i + 1}: ${res.status} ${res.statusText}`);
                }

                const data = await res.json();
                descriptions.push(data.analysis);
                items[i].querySelector('.detail-analysis').textContent = data.analysis;
            }

            // --- STEP 2: NARRATIVE SYNTHESIS ---
            if (!this.isBatchRunning) throw new Error("Stopped by user");

            // Update all to "Weaving Narrative..."
            items.forEach(item => item.querySelector('p').textContent = "Weaving Narrative...");

            const narrativeRes = await fetch('/api/generate/narrative', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    descriptions: descriptions,
                    user_prompt: userPrompt,
                    mode: mode
                })
            });
            const narrativeData = await narrativeRes.json();
            let enhancedPrompts = narrativeData.prompts;

            if (!enhancedPrompts || enhancedPrompts.length === 0) {
                enhancedPrompts = new Array(files.length).fill(userPrompt);
            }

            // Update UI with generated prompts
            items.forEach((item, idx) => {
                if (enhancedPrompts[idx]) {
                    item.querySelector('.detail-prompt').textContent = enhancedPrompts[idx];
                }
            });

            // --- STEP 3 & 4: OUTPAINT & ANIMATE ---
            for (let i = 0; i < files.length; i++) {
                if (!this.isBatchRunning) throw new Error("Stopped by user");

                const item = items[i];
                // Keep the label simple, details are in the toggle
                item.querySelector('p').textContent = `Animating ${i + 1}/${files.length}...`;

                // A. Outpaint
                // We use a simple prompt strategy for outpainting based on the narrative
                const currentPrompt = (enhancedPrompts && enhancedPrompts[i]) ? enhancedPrompts[i] : userPrompt;

                // Add explicit "North Star" context to outpainting to prevent hallucination
                const outpaintPrompt = `(Extension of image) Expand this image to fill a ${selectedAspectRatio} frame. Theme: ${userPrompt}. Context: ${currentPrompt}`;

                const outpaintRes = await fetch('/api/generate/image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: outpaintPrompt,
                        model: 'gemini-3-pro-image-preview',
                        aspect_ratio: selectedAspectRatio,
                        input_images: [originalBase64s[i]]
                    })
                });

                if (!outpaintRes.ok) {
                    throw new Error(`Outpainting failed for image ${i + 1}: ${outpaintRes.statusText}`);
                }

                const outData = await outpaintRes.json();

                if (!outData.image) {
                    throw new Error(`Outpainting returned no image data for image ${i + 1}`);
                }

                const outpaintedB64 = outData.image;

                // B. Animate (Veo)
                const veoRes = await fetch('/api/generate/video', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: enhancedPrompts[i],
                        model: selectedModel,
                        aspect_ratio: selectedAspectRatio,
                        start_frame_image: outpaintedB64,
                        duration: selectedDuration
                    })
                });

                if (!veoRes.ok) throw new Error("Video gen failed for item " + (i + 1));
                const veoData = await veoRes.json();

                // Update UI
                item.querySelector('div').innerHTML = `
                    <video controls autoplay loop muted style="width:100%; height:100%; object-fit:cover;">
                        <source src="data:video/mp4;base64,${veoData.video}" type="video/mp4">
                    </video>
                `;
                item.querySelector('p').title = enhancedPrompts[i];
                item.querySelector('p').textContent = `Scene ${i + 1}`;

                // Add download link
                const dlLink = document.createElement('a');
                dlLink.href = `data:video/mp4;base64,${veoData.video}`;
                dlLink.download = `story_scene_${i + 1}.mp4`;
                dlLink.textContent = "⬇️";
                dlLink.style.cssText = "display:block; text-align:center; text-decoration:none; margin-top:2px;";
                item.appendChild(dlLink);
            }

        } catch (e) {
            console.error(e);
            this.showToast("Batch Workflow Error: " + e.message, 'error');
        } finally {
            this.isBatchRunning = false;
            if (stopBtn) stopBtn.style.display = 'none';
            if (closeBtn) closeBtn.style.display = 'block';
        }
    }

    /**
     * Read a file as base64 data URL, with optional image compression.
     * @param {File} file - The file to read
     * @param {Object} opts - Options
     * @param {boolean} opts.compress - Whether to compress images (default: true for images)
     * @param {number} opts.maxDimension - Max width or height in px (default: 2048)
     * @param {number} opts.quality - JPEG quality 0-1 (default: 0.85)
     */
    async readFileAsBase64(file, opts = {}) {
        const isImage = file.type.startsWith('image/');
        const compress = opts.compress !== undefined ? opts.compress : isImage;

        if (!compress || !isImage) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        const maxDim = opts.maxDimension || 2048;
        const quality = opts.quality || 0.85;

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = () => {
                const img = new Image();
                img.onerror = () => reject(new Error('Failed to load image for compression'));
                img.onload = () => {
                    let { width, height } = img;

                    // Skip compression if already small enough
                    if (width <= maxDim && height <= maxDim && file.size < 500_000) {
                        resolve(reader.result);
                        return;
                    }

                    // Scale down proportionally
                    if (width > maxDim || height > maxDim) {
                        const scale = maxDim / Math.max(width, height);
                        width = Math.round(width * scale);
                        height = Math.round(height * scale);
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Use JPEG for photos, PNG for transparency
                    const hasAlpha = file.type === 'image/png';
                    const mimeType = hasAlpha ? 'image/png' : 'image/jpeg';
                    const dataUrl = canvas.toDataURL(mimeType, hasAlpha ? undefined : quality);
                    resolve(dataUrl);
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    /**
     * Read a file as plain text (for JSON files, etc.)
     */
    async readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }

    handleBatchFileSelect(event, targetId) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);
                if (json.prompts && Array.isArray(json.prompts)) {
                    // Extract text from prompt objects
                    const texts = json.prompts.map(p => p.text).join('\\n');
                    document.getElementById(targetId).value = texts;
                } else {
                    this.showToast("Invalid JSON format. Expected 'prompts' array.", 'error');
                }
            } catch (err) {
                this.showToast("Error parsing JSON: " + err.message, 'error');
            }
        };
        reader.readAsText(file);
    }

    // --- API Logic ---

    async saveApiKey() {
        const key = document.getElementById('api-key-input').value;
        if (!key) return;
        try {
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: key })
            });
            if (res.ok) {
                this.showToast('API Key Saved!', 'success');
                this.closeAllModals();
                this.setApiDot(true);
            }
        } catch (e) { console.error(e); }
    }

    setApiDot(configured) {
        const btn = document.getElementById('api-key-btn');
        const dot = document.getElementById('api-dot');
        if (btn) btn.classList.toggle('active', configured);
        if (dot) {
            dot.style.background = configured ? '#10b981' : '';
            dot.style.opacity = configured ? '1' : '0';
        }
    }

    async checkApiKeyStatus() {
        try {
            const res = await fetch('/api/health');
            if (res.ok) {
                const data = await res.json();
                this.apiKeyConfigured = !!data.api_key_configured;
                this.setApiDot(this.apiKeyConfigured);
            }
        } catch (e) { /* server not ready yet, dot stays grey */ }
    }

    async generateImage() {
        const promptInput = document.getElementById('image-prompt-input').value;
        const model = document.getElementById('image-model-select').value;
        const aspectRatio = document.getElementById('image-aspect-select').value;
        const isBatch = document.getElementById('image-batch-toggle').checked;

        // Gemini 3 Advanced
        const resolution = document.getElementById('gemini-media-resolution')?.value;
        const thinkingLevel = document.getElementById('gemini-thinking-level')?.value;
        const includeThoughts = document.getElementById('gemini-include-thoughts')?.checked;
        const personGen = document.getElementById('gemini-person-generation')?.value;
        const watermark = document.getElementById('gemini-watermark')?.checked;
        const useGoogleSearch = document.getElementById('gemini-use-google-search')?.checked;

        // Sampling controls
        const tempSlider = document.getElementById('sampling-temperature');
        const topKSlider = document.getElementById('sampling-top-k');
        const topPSlider = document.getElementById('sampling-top-p');
        const temperature = tempSlider ? parseFloat(tempSlider.value) / 100 : null;
        const topK = topKSlider ? parseInt(topKSlider.value) : null;
        const topP = topPSlider ? parseFloat(topPSlider.value) / 100 : null;

        // Prepare input images
        const inputImages = this.selectedRefImages.map(img => img.base64);

        this.closeAllModals();

        const params = {
            prompt: promptInput,
            model: model,
            aspect_ratio: aspectRatio,
            input_images: inputImages.length > 0 ? inputImages : null,
            media_resolution: resolution,
            thinking_level: thinkingLevel,
            include_thoughts: includeThoughts,
            person_generation: personGen,
            add_watermark: watermark,
            use_google_search: useGoogleSearch,
            temperature: temperature,
            top_k: topK,
            top_p: topP,
            tags: this.app?.currentTemplate?.tags || null
        };

        if (isBatch) {
            const prompts = promptInput.split('\n').filter(p => p.trim() !== '');
            if (prompts.length === 0) {
                this.showToast("No prompts found!", 'warning');
                return;
            }
            // Batch mode logic might need update to handle multiple ref images per prompt if we wanted that complexity
            // For now, we'll use the globally selected images for all batch items if provided
            this.runBatch(prompts, 'image', params);
        } else {
            this.showLoading('image');
            this.runSingle('image', params);
        }
    }

    async enhancePrompt() {
        const promptInput = document.getElementById('image-prompt-input');
        const currentPrompt = promptInput.value.trim();

        if (!currentPrompt) {
            this.showToast("Please enter a prompt first.", 'warning');
            return;
        }

        const btn = document.getElementById('enhance-prompt-btn');
        const originalText = btn.textContent;
        btn.textContent = "Enhancing...";
        btn.disabled = true;

        try {
            const enhancementPrompt = `Transform this image generation keyword list into a rich, descriptive narrative paragraph suitable for Gemini 3 Pro image generation. Keep the core concept but enhance with atmospheric details, lighting, composition, and style. Original keywords: "${currentPrompt}"`;

            const res = await fetch('/api/generate/text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: enhancementPrompt,
                    model: 'gemini-3-flash-preview'
                })
            });

            const data = await res.json();
            if (data.status === 'success') {
                promptInput.value = data.text.trim();
            } else {
                this.showToast("Failed to enhance prompt.", 'error');
            }
        } catch (e) {
            console.error(e);
            this.showToast("Error enhancing prompt: " + e.message, 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    async generateVideo() {
        try {
            const wfMode = this._videoWorkflowMode || 'standard';

            if (wfMode === 'story') {
                await this.runBatchStoryWorkflow();
                return;
            }
            if (wfMode === 'batch') {
                await this.runSimpleBatchWorkflow();
                return;
            }
            const promptInput = document.getElementById('video-prompt-input').value;

            // Read active generation mode from the mode bar
            const activeMode = document.querySelector('#video-mode-bar .vmode-btn.active')?.dataset.mode || 'text';

            // Require a prompt for all modes except Extend (which uses a continuation prompt, can be blank)
            if (activeMode !== 'extend' && !promptInput.trim()) {
                this.showToast("Please enter a prompt.", 'warning');
                return;
            }

            const model = document.getElementById('video-model-select').value;
            const duration = document.getElementById('video-duration-select').value;
            const aspectRatio = document.getElementById('video-aspect-select').value;
            const resolution = document.getElementById('video-resolution-select')?.value || '720p';

            let startFrame = null, endFrame = null, referenceImages = null, extensionVideo = null;

            if (activeMode === 'image') {
                const el = document.getElementById('video-first-frame-input');
                if (!el || !el.files.length) {
                    this.showToast("Image mode requires a starting frame.", 'warning');
                    return;
                }
                startFrame = await this.readFileAsBase64(el.files[0]);

            } else if (activeMode === 'interpolate') {
                const sEl = document.getElementById('video-first-frame-input-interp');
                const eEl = document.getElementById('video-last-frame-input');
                if (!sEl?.files.length || !eEl?.files.length) {
                    this.showToast("Interpolate mode requires both a start and end frame.", 'warning');
                    return;
                }
                startFrame = await this.readFileAsBase64(sEl.files[0]);
                endFrame   = await this.readFileAsBase64(eEl.files[0]);

            } else if (activeMode === 'reference') {
                const refIds = ['video-ref1-input', 'video-ref2-input', 'video-ref3-input'];
                const refs = [];
                for (const id of refIds) {
                    const el = document.getElementById(id);
                    if (el?.files.length) refs.push(await this.readFileAsBase64(el.files[0]));
                }
                if (!refs.length) {
                    this.showToast("Reference mode requires at least one reference image.", 'warning');
                    return;
                }
                referenceImages = refs;

            } else if (activeMode === 'extend') {
                // Extension uses a stored Google URI from a prior generation — not a file upload.
                const select = document.getElementById('video-extend-recent-select');
                const manual = document.getElementById('video-extend-uri-input');
                const uri = (select?.value || manual?.value || '').trim();
                if (!uri) {
                    this.showToast("Extend mode requires selecting or pasting a video URI from a prior generation.", 'warning', 5000);
                    return;
                }
                extensionVideo = uri;  // repurpose variable as URI string for params below
            }

            this.closeAllModals();

            const params = {
                model,
                duration,
                aspect_ratio: aspectRatio,
                resolution,
                start_frame_image: startFrame,
                end_frame_image: endFrame,
                reference_images: referenceImages,
                extension_video_uri: activeMode === 'extend' ? extensionVideo : null
            };

            const prompts = promptInput.split('\n').filter(p => p.trim() !== '');
            const isBatch = prompts.length > 1;

            if (isBatch) {
                if (prompts.length === 0) {
                    this.showToast("No prompts found!", 'warning');
                    return;
                }
                this.runBatch(prompts, 'video', params);
            } else {
                this.showLoading('video');
                this.runSingle('video', { ...params, prompt: promptInput });
            }
        } catch (e) {
            console.error(e);
            this.showError("Error preparing video generation: " + e.message);
        }
    }

    async runSingle(type, params) {
        try {
            const endpoint = type === 'image' ? '/api/generate/image' : '/api/generate/video';

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            if (!res.ok) throw new Error((await res.json()).detail);

            const data = await res.json();
            const content = document.getElementById('studio-content');

            if (type === 'image') {
                // Store for lightbox / Smart Video Options
                this.currentBatchResults = [data.image];
                this.currentLightboxIndex = 0;

                // Auto-push to OBS display page
                window.synthSmall?.displayBroadcaster?.sendImage(
                    `data:image/png;base64,${data.image}`, 'generated'
                );

                // Notify history strip
                window.dispatchEvent(new CustomEvent('synthograsizer:media-generated', {
                    detail: {
                        text: window.synthSmall?.getCurrentPromptText() || params.prompt || '',
                        mediaSrc: `data:image/png;base64,${data.image}`,
                        mediaType: 'image'
                    }
                }));

                let html = `<img src="data:image/png;base64,${data.image}" class="studio-result-image" style="cursor:pointer;" onclick="window.studioIntegrationInstance.openLightbox(0)">`;
                html += `<div style="margin-top:10px; display:flex; justify-content:center; gap:10px;">`;
                html += `<button onclick="window.studioIntegrationInstance.openVideoOptionsFromResult(0)" style="background:rgba(156,39,176,0.15); border:1px solid rgba(156,39,176,0.4); color:#7b1fa2; padding:6px 14px; border-radius:6px; cursor:pointer; font-size:13px;">🎬 Smart Video Options</button>`;
                html += `<button onclick="window.studioIntegrationInstance.pushCurrentImageToScope(window.studioIntegrationInstance.currentBatchResults[0])" style="background:rgba(0,120,200,0.15); border:1px solid rgba(0,120,200,0.4); color:#0078c8; padding:6px 14px; border-radius:6px; cursor:pointer; font-size:13px;">📡 Send to Scope</button>`;
                html += `</div>`;
                if (data.text) {
                    html += `<div style="margin-top:10px; padding:10px; background:#f0f0f0; border-radius:5px; font-family:monospace; white-space:pre-wrap; max-height:200px; overflow-y:auto;"><strong>Thinking Process:</strong><br>${data.text}</div>`;
                }
                content.innerHTML = html;
            } else {
                content.innerHTML = `
                <video controls autoplay loop class="studio-result-video">
                    <source src="data:video/mp4;base64,${data.video}" type="video/mp4">
                    </video>`;

                // Store the video URI for future extension (valid for 48h on Google's servers)
                if (data.video_uri) {
                    try {
                        const stored = JSON.parse(sessionStorage.getItem('veo_recent_generations') || '[]');
                        const label = `${params.prompt?.slice(0, 40) || 'Video'}... (${new Date().toLocaleTimeString()})`;
                        stored.unshift({ uri: data.video_uri, label, timestamp: Date.now() });
                        sessionStorage.setItem('veo_recent_generations', JSON.stringify(stored.slice(0, 10)));
                    } catch (_) {}
                }

                // Auto-push video to OBS display page
                window.synthSmall?.displayBroadcaster?.sendVideo(
                    `data:video/mp4;base64,${data.video}`
                );

                // Notify history strip
                window.dispatchEvent(new CustomEvent('synthograsizer:media-generated', {
                    detail: {
                        text: window.synthSmall?.getCurrentPromptText() || params.prompt || '',
                        mediaSrc: `data:video/mp4;base64,${data.video}`,
                        mediaType: 'video'
                    }
                }));
            }
        } catch (e) {
            this.showError(e.message);
        }
    }

    async runBatch(prompts, type, params) {
        this.isBatchRunning = true;
        this.currentBatchResults = []; // Reset for lightbox

        const resultContainer = document.getElementById('studio-result');
        const contentDiv = document.getElementById('studio-content');
        const stopBtn = document.getElementById('stop-batch-btn');
        const closeBtn = document.getElementById('close-studio-result');

        resultContainer.classList.add('active');
        stopBtn.style.display = 'inline-block';
        closeBtn.style.display = 'none';
        contentDiv.innerHTML = '<div class="studio-result-grid" id="batch-grid"></div>';
        const grid = document.getElementById('batch-grid');

        const endpoint = type === 'image' ? '/api/generate/image' : '/api/generate/video';

        for (let i = 0; i < prompts.length; i++) {
            if (!this.isBatchRunning) break;

            const prompt = prompts[i];

            // Check if auto-enhance is enabled for batch mode
            const shouldEnhance = document.getElementById('image-batch-enhance-toggle')?.checked;
            let finalPrompt = prompt;

            // Add placeholder item FIRST so we can update its status
            const item = document.createElement('div');
            item.className = 'studio-result-item';
            item.innerHTML = `
                        <div style="height:150px; display:flex; align-items:center; justify-content:center; background:#f5f5f5;">
                            <span style="font-size:12px; color:#999;">${shouldEnhance ? `Enhancing ${i + 1}/${prompts.length}...` : `Generating ${i + 1}/${prompts.length}...`}</span>
                </div>
                <p style="font-size:11px; color:#666; max-height:40px; overflow:hidden;">${prompt.substring(0, 100)}...</p>
            `;
            grid.appendChild(item);
            grid.scrollTop = grid.scrollHeight;

            // Now perform enhancement if enabled
            if (shouldEnhance) {
                try {
                    console.log(`Enhancing prompt ${i + 1}:`, prompt.substring(0, 50) + '...');
                    finalPrompt = await this.fetchEnhancedText(prompt);
                    console.log(`Enhanced result ${i + 1}:`, finalPrompt.substring(0, 50) + '...');

                    // Update status to show enhancement complete
                    const statusSpan = item.querySelector('span');
                    if (statusSpan) {
                        statusSpan.textContent = `Generating ${i + 1}/${prompts.length}...`;
                    }
                    // Update the prompt display with enhanced version
                    const promptP = item.querySelector('p');
                    if (promptP) {
                        promptP.textContent = finalPrompt.substring(0, 100) + '...';
                        promptP.title = finalPrompt; // Show full on hover
                    }
                } catch (e) {
                    console.error(`Failed to enhance prompt ${i + 1}:`, e);
                    // Continue with original prompt if enhancement fails
                    const statusSpan = item.querySelector('span');
                    if (statusSpan) {
                        statusSpan.textContent = `Generating ${i + 1}/${prompts.length}... (enhance failed)`;
                    }
                }
            }

            // Handle Batch Reference Images
            let currentRefImage = params.reference_image;
            if (type === 'image') {
                const refFiles = document.getElementById('image-batch-ref-folder')?.files;
                if (refFiles && refFiles.length > 0) {
                    try {
                        // Cycle through images
                        const refFile = refFiles[i % refFiles.length];
                        // Only read if it's an image
                        if (refFile.type.startsWith('image/')) {
                            currentRefImage = await this.readFileAsBase64(refFile);
                        }
                    } catch (e) {
                        console.error("Failed to read batch reference image:", e);
                    }
                }
            }

            try {
                // Merge prompt into params
                const currentParams = { ...params, prompt: finalPrompt, reference_image: currentRefImage };

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(currentParams)
                });

                if (!res.ok) throw new Error((await res.json()).detail);
                const data = await res.json();

                // Update item
                if (type === 'image') {
                    this.currentBatchResults.push(data.image);
                    const resultIndex = this.currentBatchResults.length - 1;

                    const imgDiv = item.querySelector('div');
                    imgDiv.innerHTML = '';
                    const img = document.createElement('img');
                    img.src = `data:image/png;base64,${data.image}`;
                    img.style.cursor = 'pointer';
                    img.onclick = () => this.openLightbox(resultIndex);
                    imgDiv.appendChild(img);

                    // Auto-push latest batch image to OBS display page
                    window.synthSmall?.displayBroadcaster?.sendImage(
                        `data:image/png;base64,${data.image}`, `batch-${resultIndex + 1}`
                    );
                } else {
                    item.querySelector('div').innerHTML = `
                <video controls autoplay loop muted>
                    <source src="data:video/mp4;base64,${data.video}" type="video/mp4">
                    </video>`;

                    // Auto-push video to OBS display page
                    window.synthSmall?.displayBroadcaster?.sendVideo(
                        `data:video/mp4;base64,${data.video}`
                    );
                }
            } catch (e) {
                item.querySelector('div').innerHTML = `<span style="color:red; font-size:10px; padding:5px;">Error</span>`;
                console.error(e);
            }

            // Small delay to be nice to the API
            await new Promise(r => setTimeout(r, 500));
        }

        this.isBatchRunning = false;
        stopBtn.style.display = 'none';
        closeBtn.style.display = 'block';
    }

    async runTemplateGen() {
        const mode = this.templateGenMode || 'text';
        let body = { mode };

        // Validate & build request body per mode
        switch (mode) {
            case 'text': {
                const prompt = document.getElementById('template-prompt-input').value;
                if (!prompt.trim()) { this.showToast("Please enter a template description.", 'warning'); return; }
                body.prompt = prompt;
                break;
            }
            case 'image': {
                const input = document.getElementById('tg-image-input');
                if (!input || !input.files.length) { this.showToast("Please select an image.", 'warning'); return; }
                body.images = [await this.readFileAsBase64(input.files[0])];
                break;
            }
            case 'hybrid': {
                const input = document.getElementById('tg-hybrid-image');
                const direction = document.getElementById('tg-hybrid-direction')?.value;
                if (!input || !input.files.length) { this.showToast("Please select a reference image.", 'warning'); return; }
                if (!direction || !direction.trim()) { this.showToast("Please enter a text direction describing the variables you want.", 'warning'); return; }
                body.images = [await this.readFileAsBase64(input.files[0])];
                body.prompt = direction;
                break;
            }
            case 'multi-image': {
                const input = document.getElementById('tg-multi-image-input');
                if (!input || !input.files.length || input.files.length < 2) {
                    this.showToast("Please select at least 2 images for pattern extraction.", 'warning'); return;
                }
                body.images = [];
                for (const file of input.files) {
                    body.images.push(await this.readFileAsBase64(file));
                }
                break;
            }
            case 'remix': {
                const instruction = document.getElementById('tg-remix-instruction')?.value;
                if (!instruction || !instruction.trim()) { this.showToast("Please enter remix instructions.", 'warning'); return; }
                if (!this.app?.currentTemplate) { this.showToast("No template loaded to remix. Please load a template first.", 'warning'); return; }
                body.prompt = instruction;
                body.current_template = this.app.currentTemplate;
                // Capture parent info for remix lineage tagging (used after template loads)
                this._remixParentInfo = {
                    fingerprint: window.__computeTemplateFingerprint?.(this.app.currentTemplate) || null,
                    promptPreview: (this.app.currentTemplate.promptTemplate || '').slice(0, 60),
                    instruction: instruction.trim(),
                    parentTags: (this.app.currentTemplate.tags || []).filter(t => t.type !== 'remix')
                };
                break;
            }
            case 'story': {
                const storyPrompt = document.getElementById('tg-story-prompt')?.value;
                if (!storyPrompt || !storyPrompt.trim()) { this.showToast("Please describe your story concept.", 'warning'); return; }
                body.prompt = storyPrompt;
                break;
            }
            case 'workflow': {
                const imageInput = document.getElementById('tg-workflow-image');
                const guidance = document.getElementById('tg-workflow-guidance')?.value || '';
                const previewMode = document.getElementById('tg-workflow-preview')?.checked ?? true;

                // Get workflow JSON (from file upload or "Use Current Template")
                if (!this.workflowModeTemplate) {
                    this.showToast("Please upload a workflow JSON or click 'Use Current Template'.", 'warning');
                    return;
                }

                if (!imageInput?.files?.length) {
                    this.showToast("Please select at least one reference image.", 'warning');
                    return;
                }

                body.workflow = this.workflowModeTemplate;
                body.images = [];
                for (const file of imageInput.files) {
                    body.images.push(await this.readFileAsBase64(file));
                }
                if (guidance.trim()) {
                    body.prompt = guidance;
                }
                body.preview = previewMode;
                body.batch = imageInput.files.length > 1;
                break;
            }
            default: {
                this.showToast("Unknown template generation mode.", 'error'); return;
            }
        }

        this.closeAllModals();

        const modeLabels = {
            'text': 'Text',
            'image': 'Image Analysis',
            'hybrid': 'Hybrid',
            'multi-image': 'Multi-Image Pattern',
            'remix': 'Remix',
            'workflow': 'Workflow Curation',
            'story': 'Story'
        };

        // Workflow mode: show progress with image count
        const modelLabel = document.querySelector('input[name="tg-model-choice"]:checked')?.value === 'flash' ? '⚡ Flash' : '🧠 Pro';
        if (mode === 'workflow') {
            const imageCount = body.images?.length || 1;
            this.showLoading(`Workflow Curation (${imageCount} image${imageCount > 1 ? 's' : ''}) — ${modelLabel}`,
                'Analyzing image and curating variables...');
        } else {
            this.showLoading(`Template Generator (${modeLabels[mode]}) — ${modelLabel}`);
        }

        try {
            // Use AbortController for timeout — per-mode values
            const controller = new AbortController();
            const timeoutTable = {
                'text': 120000, 'image': 120000, 'hybrid': 120000,
                'multi-image': 150000, 'remix': 120000,
                'story': 150000, 'workflow': 150000
            };
            const timeoutMs = timeoutTable[mode] || 120000;
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            // Read Pro/Flash model choice
            const useFlash = document.querySelector('input[name="tg-model-choice"]:checked')?.value === 'flash';
            body.use_flash = useFlash;

            const res = await fetch('/api/generate/template', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }));
                throw new Error(errorData.detail || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const content = document.getElementById('studio-content');
            const closeBtn = document.getElementById('close-studio-result');

            // Handle Workflow Mode with preview/batch support
            if (mode === 'workflow' && data.results) {
                // Batch or preview workflow response
                this.renderWorkflowResults(data.results, modeLabels[mode]);
                return;
            }

            let template = data.template;

            // Handle case where model returns an array of templates
            if (Array.isArray(template) && template.length > 0) {
                template = template[0];
            }

            // Import into Synthograsizer
            if (this.app && this.app.loadTemplate) {
                const success = this.app.loadTemplate(template);

                if (success) {
                    // ── Remix lineage: auto-tag if mode was 'remix' ──
                    if (mode === 'remix' && this._remixParentInfo) {
                        const parent = this._remixParentInfo;
                        // Ensure tags array exists on loaded template
                        if (!Array.isArray(this.app.currentTemplate.tags)) {
                            this.app.currentTemplate.tags = [];
                        }
                        // Inherit non-remix tags from parent
                        if (parent.parentTags && parent.parentTags.length > 0) {
                            for (const inherited of parent.parentTags) {
                                // Avoid duplicates (by label + type)
                                const exists = this.app.currentTemplate.tags.some(
                                    t => t.type === inherited.type && t.label === inherited.label
                                );
                                if (!exists) {
                                    this.app.currentTemplate.tags.push({ ...inherited });
                                }
                            }
                        }
                        // Create remix lineage tag
                        const remixTag = {
                            id: window.__generateTagId?.('rmx') || ('rmx_' + Date.now().toString(16)),
                            type: 'remix',
                            label: `Remixed from: ${parent.promptPreview}${parent.promptPreview.length >= 60 ? '...' : ''}`,
                            description: parent.instruction,
                            date: new Date().toISOString(),
                            meta: {
                                parent_fingerprint: parent.fingerprint,
                                remix_instruction: parent.instruction
                            }
                        };
                        this.app.currentTemplate.tags.push(remixTag);
                        this._remixParentInfo = null; // Clear after use
                    }

                    content.innerHTML = `
                        <div style="text-align:center; padding:20px;">
                            <h3 style="color:#009688;">Template Generated & Imported!</h3>
                            <p style="margin:10px 0; font-size:14px;">Mode: <strong>${modeLabels[mode]}</strong> &mdash; Check the main Synthograsizer interface to use your new template.</p>
                            <div style="background:#f5f5f5; padding:10px; text-align:left; border-radius:6px; max-height:200px; overflow:auto; border:1px solid #eee;">
                                <pre style="margin:0; font-size:11px;">${JSON.stringify(this.app.currentTemplate, null, 2)}</pre>
                            </div>
                        </div>
                    `;
                    closeBtn.style.display = 'block';
                } else {
                    throw new Error("Template generated but failed to load into app.");
                }
            } else {
                throw new Error("Synthograsizer App instance not found.");
            }

        } catch (e) {
            // Handle timeout/abort specifically
            if (e.name === 'AbortError') {
                const useFlash = document.querySelector('input[name="tg-model-choice"]:checked')?.value === 'flash';
                const suggestion = useFlash
                    ? 'The request timed out even with Flash mode. Try a simpler prompt or smaller image.'
                    : 'Try switching to Flash mode (faster) or simplifying your request.';
                this.showError(`Request timed out. ${suggestion}`);
            } else {
                this.showError(e.message || 'An unexpected error occurred');
            }
        }
    }

    /**
     * Render workflow curation results with preview/batch support
     */
    renderWorkflowResults(results, modeLabel) {
        const content = document.getElementById('studio-content');
        const closeBtn = document.getElementById('close-studio-result');

        // Store results for later use
        this.workflowResults = results;

        let html = `<div style="padding:15px;">`;
        html += `<h3 style="color:#009688; margin-bottom:15px;">Workflow Curation Results</h3>`;

        if (results.length === 1) {
            // Single result with preview
            const result = results[0];
            html += this.renderSingleWorkflowResult(result, 0);
        } else {
            // Multiple results (batch mode)
            html += `<p style="margin-bottom:15px; font-size:13px; color:#666;">Generated ${results.length} curated workflows from your reference images.</p>`;
            html += `<div style="display:flex; flex-direction:column; gap:15px;">`;
            results.forEach((result, idx) => {
                html += `<div style="border:1px solid #e0e0e0; border-radius:8px; padding:12px;">`;
                html += `<div style="font-weight:600; margin-bottom:8px;">Image ${idx + 1}</div>`;
                html += this.renderSingleWorkflowResult(result, idx);
                html += `</div>`;
            });
            html += `</div>`;
        }

        html += `</div>`;
        content.innerHTML = html;
        closeBtn.style.display = 'block';

        // Bind import buttons
        results.forEach((result, idx) => {
            const importBtn = document.getElementById(`workflow-import-${idx}`);
            if (importBtn) {
                importBtn.onclick = () => this.importWorkflowResult(idx);
            }
            const downloadBtn = document.getElementById(`workflow-download-${idx}`);
            if (downloadBtn) {
                downloadBtn.onclick = () => this.downloadWorkflowResult(idx);
            }
            const toggleBtn = document.getElementById(`workflow-toggle-rationale-${idx}`);
            if (toggleBtn) {
                toggleBtn.onclick = () => {
                    const rationaleEl = document.getElementById(`workflow-rationale-${idx}`);
                    if (rationaleEl) {
                        rationaleEl.style.display = rationaleEl.style.display === 'none' ? 'block' : 'none';
                        toggleBtn.textContent = rationaleEl.style.display === 'none' ? 'Show Rationale' : 'Hide Rationale';
                    }
                };
            }
        });
    }

    renderSingleWorkflowResult(result, idx) {
        const template = result.template;
        const rationale = result.rationale || [];

        let html = ``;

        // Show curated variable selections
        if (template.variables && template.variables.length > 0) {
            html += `<div style="margin-bottom:10px;">`;
            html += `<div style="font-size:12px; color:#666; margin-bottom:6px;">Curated Selections:</div>`;
            html += `<div style="display:flex; flex-wrap:wrap; gap:6px;">`;
            template.variables.forEach(v => {
                const rawVal = v.values && v.values[0] ? v.values[0] : null;
                const selectedVal = rawVal ? (typeof rawVal === 'object' && rawVal.text ? rawVal.text : String(rawVal)) : '(empty)';
                html += `<span style="background:#e8f5e9; color:#2e7d32; padding:4px 8px; border-radius:4px; font-size:11px;">
                    <strong>${v.feature_name || v.name}:</strong> ${selectedVal}
                </span>`;
            });
            html += `</div></div>`;
        }

        // Rationale section (collapsible)
        if (rationale.length > 0) {
            html += `<button id="workflow-toggle-rationale-${idx}" style="background:none; border:1px solid #ddd; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px; margin-bottom:8px;">Show Rationale</button>`;
            html += `<div id="workflow-rationale-${idx}" style="display:none; background:#f9f9f9; padding:10px; border-radius:6px; margin-bottom:10px; font-size:11px; max-height:150px; overflow:auto;">`;
            rationale.forEach(r => {
                html += `<div style="margin-bottom:6px;"><strong>${r.variable}:</strong> ${r.reason}</div>`;
            });
            html += `</div>`;
        }

        // JSON preview
        html += `<div style="background:#f5f5f5; padding:8px; border-radius:6px; max-height:120px; overflow:auto; margin-bottom:10px; border:1px solid #eee;">`;
        html += `<pre style="margin:0; font-size:10px;">${JSON.stringify(template, null, 2)}</pre>`;
        html += `</div>`;

        // Action buttons
        html += `<div style="display:flex; gap:8px;">`;
        html += `<button id="workflow-import-${idx}" class="studio-btn-primary" style="background:#009688; font-size:12px; padding:6px 12px;">Import to Synthograsizer</button>`;
        html += `<button id="workflow-download-${idx}" class="studio-btn-secondary" style="font-size:12px; padding:6px 12px;">Download JSON</button>`;
        html += `</div>`;

        return html;
    }

    importWorkflowResult(idx) {
        if (!this.workflowResults || !this.workflowResults[idx]) {
            this.showToast("Result not found.", 'error');
            return;
        }
        const template = this.workflowResults[idx].template;
        if (this.app && this.app.loadTemplate) {
            const success = this.app.loadTemplate(template);
            if (success) {
                this.showToast("Curated workflow imported!", 'success');
                this.closeAllModals();
            } else {
                this.showToast("Failed to import workflow.", 'error');
            }
        }
    }

    downloadWorkflowResult(idx) {
        if (!this.workflowResults || !this.workflowResults[idx]) {
            this.showToast("Result not found.", 'error');
            return;
        }
        const template = this.workflowResults[idx].template;
        const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `curated_workflow_${idx + 1}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async runImageAnalysis() {
        const batchMode = document.getElementById('analysis-batch-toggle')?.checked;

        if (batchMode) {
            await this.runBatchAnalysis();
            return;
        }

        const input = document.getElementById('analysis-input-image');
        const resultBox = document.getElementById('analysis-result-box');
        const resultText = document.getElementById('analysis-result-text');

        if (!input.files.length) {
            this.showToast("Please select an image to analyze.", 'warning');
            return;
        }

        const btn = document.getElementById('run-image-analysis');
        const originalText = btn.innerText;
        btn.innerText = "Analyzing...";
        btn.disabled = true;
        resultBox.style.display = 'none';

        try {
            const imageB64 = await this.readFileAsBase64(input.files[0]);
            const autoGenerate = document.getElementById('analysis-auto-generate')?.checked;

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
                < div style = "margin-bottom:8px; font-weight:600;" > Auto - Generated Image</div >
                    <div style="font-size:12px; color:#666; margin-bottom:8px;">
                        Aspect Ratio: ${data.detected_aspect_ratio} (Original: ${data.original_dimensions})
                    </div>
                    <img src="data:image/png;base64,${data.generated_image}" style="max-width:100%; border-radius:4px;">
                `;
                resultBox.appendChild(imgContainer);
            }

            // Setup copy button
            const copyBtn = document.getElementById('copy-analysis-btn');
            if (copyBtn) {
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(data.analysis);
                    const originalCopyText = copyBtn.innerText;
                    copyBtn.innerText = "Copied!";
                    setTimeout(() => copyBtn.innerText = originalCopyText, 2000);
                };
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
                        this.showToast("Template generated but failed to load.", 'error');
                    }
                }
            }

        } catch (e) {
            this.showToast("Analysis failed: " + e.message, 'error');
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }

    async runBatchAnalysis() {
        const folderInput = document.getElementById('analysis-batch-folder');
        const autoGenerate = document.getElementById('analysis-auto-generate')?.checked;
        const autoTemplate = document.getElementById('analysis-auto-template')?.checked;

        if (!folderInput.files.length) {
            this.showToast("Please select a folder of images.", 'warning');
            return;
        }

        const images = Array.from(folderInput.files).filter(f => f.type.startsWith('image/'));

        if (images.length === 0) {
            this.showToast("No images found in selected folder.", 'warning');
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

            // Backend streams NDJSON (one JSON object per line) — parse line by line
            const text = await res.text();
            const results = text
                .split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line))
                .sort((a, b) => a.index - b.index);

            // Display results in grid
            const content = document.getElementById('studio-content');
            content.innerHTML = `
                <div style="margin-bottom:20px;">
                    <h3>Batch Analysis Complete</h3>
                    <p>${results.length} images processed</p>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:20px;">
                    ${results.map((result, idx) => `
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
                                        <img src="data:image/png;base64,${result.generated_image}"
                                             style="width:100%; border-radius:4px; margin-top:8px; cursor:pointer;"
                                             onclick="window.studioIntegration.openLightbox(${idx})"
                                             data-lightbox-src="data:image/png;base64,${result.generated_image}">
                                    </div>
                                ` : ''}
                            ` : `
                                <div style="color:#d32f2f;">Error: ${this.escapeHtml(result.error)}</div>
                            `}
                        </div>
                    `).join('')}
                </div>
            `;

            // Setup lightbox for batch results
            this.currentBatchResults = results
                .filter(r => r.status === 'success' && r.generated_image)
                .map(r => r.generated_image);

            document.getElementById('studio-result').classList.add('active');

            // Auto-generate one template per successful analysis
            if (autoTemplate) {
                const successes = results.filter(r => r.status === 'success');
                if (successes.length > 0) {
                    const savedGrid = content.innerHTML;
                    let generated = 0;
                    let lastTemplate = null;

                    for (let i = 0; i < successes.length; i++) {
                        this.showLoading(`Generating Template ${i + 1}/${successes.length}...`);
                        try {
                            const tmplRes = await fetch('/api/generate/template-from-analysis', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ analysis: successes[i].analysis })
                            });

                            if (!tmplRes.ok) throw new Error((await tmplRes.json()).detail);

                            const tmplData = await tmplRes.json();
                            lastTemplate = tmplData.template;

                            // Save every template to Project Templates folder
                            await fetch('/api/save-template', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ template: lastTemplate })
                            });

                            generated++;
                        } catch (e) {
                            console.warn(`Template gen failed for image ${i + 1}:`, e.message);
                        }
                    }

                    content.innerHTML = savedGrid;

                    // Load the last template into the app UI
                    if (lastTemplate && this.app && this.app.loadTemplate) {
                        this.app.loadTemplate(lastTemplate);
                    }

                    this.showToast(
                        `${generated}/${successes.length} templates generated and saved.`,
                        generated > 0 ? 'success' : 'error'
                    );
                }
            }

        } catch (e) {
            this.showError("Batch analysis failed: " + e.message);
        }
    }

    // ── Music Studio Helpers ──────────────────────────────────────────

    _musicSendPrompts() {
        const list = document.getElementById('music-prompts-list');
        if (!list) return;
        const prompts = [];
        list.querySelectorAll('.music-prompt-row').forEach(row => {
            const idx = row.dataset.idx;
            const textarea = document.getElementById(`music-prompt-${idx}`);
            const weightInput = document.getElementById(`music-weight-${idx}`);
            const text = textarea?.value?.trim();
            if (text) {
                prompts.push({
                    text,
                    weight: parseFloat(weightInput?.value || '1.0'),
                });
            }
        });
        if (prompts.length > 0) {
            this.musicClient.setPrompts(prompts);
        }
    }

    _musicSendConfig() {
        const cfg = {};
        const bpm = document.getElementById('music-bpm');
        const density = document.getElementById('music-density');
        const brightness = document.getElementById('music-brightness');
        const guidance = document.getElementById('music-guidance');
        const temperature = document.getElementById('music-temperature');
        const scale = document.getElementById('music-scale');
        const mode = document.getElementById('music-mode');
        const muteBass = document.getElementById('music-mute-bass');
        const muteDrums = document.getElementById('music-mute-drums');
        const onlyBD = document.getElementById('music-only-bass-drums');

        if (bpm) cfg.bpm = parseInt(bpm.value);
        if (density) cfg.density = parseInt(density.value) / 100;
        if (brightness) cfg.brightness = parseInt(brightness.value) / 100;
        if (guidance) cfg.guidance = parseInt(guidance.value) / 10;
        if (temperature) cfg.temperature = parseInt(temperature.value) / 10;
        if (scale) cfg.scale = scale.value;
        if (mode) cfg.music_generation_mode = mode.value;
        if (muteBass) cfg.mute_bass = muteBass.checked;
        if (muteDrums) cfg.mute_drums = muteDrums.checked;
        if (onlyBD) cfg.only_bass_and_drums = onlyBD.checked;

        this.musicClient.setConfig(cfg);
    }

    async runMetadataExtraction() {
        const batchMode = document.getElementById('metadata-batch-toggle')?.checked;
        if (batchMode) {
            await this.runBatchMetadataExtraction();
            return;
        }

        const fileInput = document.getElementById('metadata-input-image');
        const outputArea = document.getElementById('metadata-output');
        const resultArea = document.getElementById('metadata-result-area');
        const runBtn = document.getElementById('run-metadata-read');
        const addFavBtn = document.getElementById('metadata-add-fav-btn');

        if (!fileInput.files || !fileInput.files[0]) {
            this.showToast('Please select a PNG image first.', 'warning');
            return;
        }

        const file = fileInput.files[0];
        if (file.type !== 'image/png') {
            this.showToast('Only PNG images are supported for metadata extraction.', 'warning');
            return;
        }

        const originalText = runBtn.textContent;
        runBtn.textContent = 'Reading...';
        runBtn.disabled = true;
        resultArea.style.display = 'none';
        outputArea.value = '';
        if (addFavBtn) addFavBtn.style.display = 'none';

        try {
            const base64Image = await this.readFileAsBase64(file, { compress: false });

            const response = await fetch('/api/extract-metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64Image })
            });

            const data = await response.json();
            if (data.status === 'success') {
                const metadata = data.metadata;
                let displayText = "";

                if (metadata.prompt) {
                    displayText += `Prompt:\n${metadata.prompt}\n\n`;

                    // Setup Add to Favorites button
                    if (addFavBtn) {
                        addFavBtn.style.display = 'block';
                        addFavBtn.onclick = () => {
                            this.addToFavorites(metadata.prompt);
                            const originalBtnText = addFavBtn.textContent;
                            addFavBtn.textContent = "Added!";
                            setTimeout(() => addFavBtn.textContent = originalBtnText, 1000);
                        };
                    }
                }
                if (metadata.negative_prompt) {
                    displayText += `Negative Prompt:\n${metadata.negative_prompt}\n\n`;
                }

                // Display provenance tags if present
                if (metadata.provenance && metadata.provenance.tags) {
                    displayText += `── Provenance ──\n`;
                    if (metadata.provenance.generated_at) {
                        displayText += `Generated: ${metadata.provenance.generated_at}\n`;
                    }
                    displayText += `Tags (${metadata.provenance.tags.length}):\n`;
                    for (const tag of metadata.provenance.tags) {
                        const type = (tag.type || 'custom').toUpperCase();
                        displayText += `  [${type}] ${tag.label || 'Untitled'}`;
                        if (tag.url) displayText += `\n    URL: ${tag.url}`;
                        if (tag.description) displayText += `\n    ${tag.description}`;
                        if (tag.chain) displayText += `  (${tag.chain})`;
                        if (tag.date) displayText += `  (${tag.date})`;
                        if (tag.meta?.parent_fingerprint) displayText += `\n    Parent: ${tag.meta.parent_fingerprint}`;
                        displayText += `\n`;
                    }
                    displayText += `\n`;
                }

                // Display other keys
                for (const [key, value] of Object.entries(metadata)) {
                    if (['prompt', 'negative_prompt', 'provenance', 'provenance_raw'].includes(key)) continue;
                    displayText += `${key}:\n${value}\n\n`;
                }

                if (!displayText) {
                    displayText = "No metadata found in this image.";
                }

                outputArea.value = displayText.trim();
                resultArea.style.display = 'block';
            } else {
                throw new Error(data.detail || 'Unknown error');
            }
        } catch (error) {
            console.error('Metadata extraction error:', error);
            this.showToast('Extraction failed: ' + error.message, 'error');
        } finally {
            runBtn.textContent = originalText;
            runBtn.disabled = false;
        }
    }

    async runSmartTransform() {
        const batchMode = document.getElementById('smart-transform-batch-toggle')?.checked;

        // 1. Inputs
        const singleInput = document.getElementById('st-input-image');
        const folderInput = document.getElementById('st-input-folder');
        const refInput = document.getElementById('st-ref-image');
        const userIntent = document.getElementById('st-user-intent').value;
        const model = document.getElementById('st-model-select').value;
        const aspectRatio = document.getElementById('st-aspect-select').value;

        // 2. Identify Mode
        let mode = 'SINGLE';
        let inputs = [];
        let references = [];

        // Collect References (always supports multiple now)
        if (refInput.files.length > 0) {
            references = Array.from(refInput.files);
        }

        // Collect Inputs
        if (batchMode) {
            const folderInput = document.getElementById('st-input-folder');
            const filesInput = document.getElementById('st-input-batch-files');

            // Collect from Folder
            if (folderInput && folderInput.files.length > 0) {
                inputs = inputs.concat(Array.from(folderInput.files).filter(f => f.type.startsWith('image/')));
            }

            // Collect from Files
            if (filesInput && filesInput.files.length > 0) {
                inputs = inputs.concat(Array.from(filesInput.files).filter(f => f.type.startsWith('image/')));
            }

            if (inputs.length === 0) {
                this.showToast("Please select a folder OR specific images for batch processing.", 'warning');
                return;
            }
            // mode determined below
        } else {
            if (singleInput.files.length === 0) {
                this.showToast("Please select an input image.", 'warning');
                return;
            }
            inputs = [singleInput.files[0]];
        }

        // Dynamic Mode Determination
        // Priority: Safety > Style Matrix > Batch Subject

        if (references.length > 1) {
            // User wants Style Matrix (1 Subject x Many Styles)
            if (inputs.length > 1) {
                this.showToast("You selected " + inputs.length + " inputs and " + references.length + " styles (" + (inputs.length * references.length) + " images). Please select either ONE input or ONE style.", 'warning', 6000);
                return;
            }
            mode = 'STYLE_MATRIX';
        } else {
            // User wants Batch Subject (Many Subjects x 0-1 Style)
            mode = 'BATCH_SUBJECT';
        }

        this.closeAllModals();

        // 3. Execution
        const totalOps = mode === 'STYLE_MATRIX' ? references.length : inputs.length;
        this.showLoading(`Running ${mode}... (0/${totalOps})`);

        try {
            const results = [];

            if (mode === 'STYLE_MATRIX') {
                // One Subject, Many Styles
                const subjectB64 = await this.readFileAsBase64(inputs[0]);

                for (let i = 0; i < references.length; i++) {
                    this.showLoading(`Style Matrix: Generating style ${i + 1}/${references.length}...`);
                    const refB64 = await this.readFileAsBase64(references[i]);

                    const result = await this.executeTransformApi(subjectB64, refB64, userIntent, model, aspectRatio);
                    results.push({ type: 'image', data: result.image, label: `Style ${i + 1}` });
                }

            } else {
                // Batch Subject (Many Subjects, One Style or None)
                // Note: If references.length === 1, we use that one ref for all. If 0, no ref.
                const refB64 = references.length > 0 ? await this.readFileAsBase64(references[0]) : null;

                for (let i = 0; i < inputs.length; i++) {
                    this.showLoading(inputs.length === 1 ? 'Generating Smart Transform...' : `Batch Transform: Processing image ${i + 1}/${inputs.length}...`);
                    const subjectB64 = await this.readFileAsBase64(inputs[i]);

                    try {
                        const result = await this.executeTransformApi(subjectB64, refB64, userIntent, model, aspectRatio);
                        results.push({ type: 'image', data: result.image, label: inputs[i].name });
                    } catch (e) {
                        console.error(`Failed to process ${inputs[i].name}`, e);
                        results.push({ type: 'error', msg: `Failed: ${inputs[i].name} <br><small style="color:#d32f2f;">${e.message || e}</small>` });
                    }
                }
            }

            // 4. Render Results
            this.renderBatchResults(results);

        } catch (e) {
            this.showError("Transform failed: " + e.message);
        }
    }

    async executeTransformApi(inputB64, refB64, intent, model, aspectRatio) {
        const res = await fetch('/api/generate/smart-transform', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                input_image: inputB64,
                reference_image: refB64,
                user_intent: intent,
                model: model,
                aspect_ratio: aspectRatio
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail || err);
            throw new Error(msg);
        }
        return await res.json();
    }

    renderBatchResults(results) {
        const content = document.getElementById('studio-content');
        content.innerHTML = `
            <div style="padding:20px;">
                <h3>Transform Results (${results.length})</h3>
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(250px, 1fr)); gap:20px; margin-top:20px;">
                    ${results.map((r, idx) => `
                        <div style="border:1px solid #eee; padding:10px; border-radius:8px;">
                            ${r.type === 'image' ? `
                                <div style="margin-bottom:5px; font-weight:600; font-size:12px;">${r.label || ('Image ' + (idx + 1))}</div>
                                <img src="data:image/png;base64,${r.data}" style="width:100%; border-radius:4px; cursor:pointer;"
                                     onclick="window.studioIntegration.openLightboxWithImage('data:image/png;base64,${r.data}')">
                            ` : `
                                <div style="color:red; font-size:12px;">${r.msg}</div>
                            `}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        const closeBtn = document.getElementById('close-studio-result');
        if (closeBtn) closeBtn.style.display = 'block';
    }

    openLightboxWithImage(src) {
        const lightbox = document.getElementById('studio-lightbox');
        const img = document.getElementById('lightbox-img');
        img.src = src;
        lightbox.classList.add('active');
        // Setup simple one-off nav
        this.currentBatchResults = [src.split(',')[1]]; // rough hack to support existing nav
        this.currentLightboxIndex = 0;
        this.updateLightboxCounter();
    }

    async runBatchMetadataExtraction() {
        const folderInput = document.getElementById('metadata-batch-folder');
        if (!folderInput.files.length) {
            this.showToast("Please select a folder of images.", 'warning');
            return;
        }

        const images = Array.from(folderInput.files).filter(f => f.type === 'image/png');
        if (images.length === 0) {
            this.showToast("No PNG images found in selected folder.", 'warning');
            return;
        }

        this.closeAllModals();
        this.showLoading(`Batch Metadata Extraction (0 / ${images.length})`);

        // ── Client-side extraction in sequential chunks ──
        // Reads PNG text chunks directly — no base64, no backend round-trip.
        const CHUNK_SIZE = 20;
        const results = [];

        try {
            for (let i = 0; i < images.length; i += CHUNK_SIZE) {
                const chunk = images.slice(i, i + CHUNK_SIZE);

                for (const file of chunk) {
                    try {
                        const arrayBuffer = await file.arrayBuffer();
                        const meta = window.extractAIMetadataFromPNG(arrayBuffer);
                        results.push({
                            index: results.length,
                            status: 'success',
                            prompt: meta.prompt || '',
                            metadata: meta,
                            filename: file.name
                        });
                    } catch (err) {
                        results.push({
                            index: results.length,
                            status: 'error',
                            error: err.message,
                            prompt: '',
                            filename: file.name
                        });
                    }
                }

                // Update progress
                const processed = Math.min(i + CHUNK_SIZE, images.length);
                this.showLoading(`Batch Metadata Extraction (${processed} / ${images.length})`);

                // Yield to the browser so the UI stays responsive
                await new Promise(r => setTimeout(r, 0));
            }

            // Render results
            const content = document.getElementById('studio-content');
            content.innerHTML = `
                <div style="margin-bottom:20px;">
                    <h3>Batch Metadata Extraction Complete</h3>
                    <p>${results.length} images processed</p>
                    <div style="display:flex; gap:10px; margin-top:10px;">
                        <button class="studio-btn-primary" id="batch-add-all-fav" style="max-width:200px;">❤️ Add All to Liked</button>
                        <button class="studio-btn-secondary" id="batch-copy-all-prompts" style="max-width:200px;">📋 Copy All Prompts</button>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:20px;">
                    ${results.map((r, idx) => `
                        <div style="border:1px solid #ddd; border-radius:8px; padding:15px; background:white;">
                            <div style="font-weight:600; margin-bottom:10px; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${this.escapeHtml(r.filename || '')}">${this.escapeHtml(r.filename || `Image ${idx + 1}`)}</div>
                            ${r.status === 'success' ? `
                                <div style="margin-bottom:10px;">
                                    <strong>Prompt:</strong>
                                    <div style="font-size:13px; color:#555; max-height:150px; overflow-y:auto; padding:8px; background:#f9f9f9; border-radius:4px; margin-top:4px;">
                                        ${this.escapeHtml(r.prompt || "No prompt found")}
                                    </div>
                                </div>
                                ${r.prompt ? `
                                    <button class="studio-btn-primary" style="font-size:11px; padding:5px;" onclick="window.studioIntegration.addToFavorites('${this.escapeForJsString(r.prompt)}', this)">
                                        Add to Liked
                                    </button>
                                ` : ''}
                            ` : `
                                <div style="color:#d32f2f;">Error: ${this.escapeHtml(r.error)}</div>
                            `}
                        </div>
                    `).join('')}
                </div>
            `;

            // Bind "Add All" button
            const addAllBtn = document.getElementById('batch-add-all-fav');
            if (addAllBtn) {
                addAllBtn.onclick = () => {
                    let count = 0;
                    results.forEach(r => {
                        if (r.status === 'success' && r.prompt) {
                            this.addToFavorites(r.prompt);
                            count++;
                        }
                    });
                    addAllBtn.textContent = `❤️ Added ${count} Prompts!`;
                    setTimeout(() => addAllBtn.textContent = '❤️ Add All to Liked', 2000);
                };
            }

            // Bind "Copy All Prompts" button
            const copyAllBtn = document.getElementById('batch-copy-all-prompts');
            if (copyAllBtn) {
                copyAllBtn.onclick = async () => {
                    const allPrompts = results
                        .filter(r => r.status === 'success' && r.prompt)
                        .map(r => r.prompt.trim())
                        .join('\n');

                    if (!allPrompts) {
                        this.showToast('No prompts found to copy.', 'warning');
                        return;
                    }

                    try {
                        await navigator.clipboard.writeText(allPrompts);
                        const originalText = copyAllBtn.textContent;
                        copyAllBtn.textContent = '✅ Copied!';
                        setTimeout(() => copyAllBtn.textContent = originalText, 2000);
                    } catch (err) {
                        console.error('Failed to copy: ', err);
                        const textArea = document.createElement("textarea");
                        textArea.value = allPrompts;
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand("Copy");
                        textArea.remove();

                        const originalText = copyAllBtn.textContent;
                        copyAllBtn.textContent = '✅ Copied!';
                        setTimeout(() => copyAllBtn.textContent = originalText, 2000);
                    }
                };
            }

            document.getElementById('studio-result').classList.add('active');

        } catch (e) {
            this.showError("Batch extraction failed: " + e.message);
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    openLightbox(index) {
        if (index < 0 || index >= this.currentBatchResults.length) return;
        this.currentLightboxIndex = index;
        const imageB64 = this.currentBatchResults[index];
        const lightbox = document.getElementById('studio-lightbox');
        const img = document.getElementById('lightbox-img');
        img.src = `data:image/png;base64,${imageB64}`;
        lightbox.classList.add('active');
        this.updateLightboxCounter();
    }

    closeLightbox() {
        document.getElementById('studio-lightbox').classList.remove('active');
        document.getElementById('lightbox-img').src = '';
    }

    navigateLightbox(dir) {
        const newIndex = this.currentLightboxIndex + dir;
        if (newIndex >= 0 && newIndex < this.currentBatchResults.length) {
            this.openLightbox(newIndex);
        }
    }

    updateLightboxCounter() {
        const counter = document.getElementById('lightbox-counter');
        const total = this.currentBatchResults.length;
        if (counter) {
            counter.textContent = total > 1
                ? `${this.currentLightboxIndex + 1} / ${total}`
                : '';
        }
        // Auto-fade the hint after first view
        const hint = document.getElementById('lightbox-hint');
        if (hint) {
            hint.style.opacity = '1';
            clearTimeout(this._hintFadeTimer);
            this._hintFadeTimer = setTimeout(() => { hint.style.opacity = '0'; }, 4000);
        }
    }

    async sendChatMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        if (!message) return;

        const model = document.getElementById('chat-model-select').value;

        this.appendMessage('user', message);
        input.value = '';

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message,
                    history: this.chatHistory,
                    model: model
                })
            });

            if (!res.ok) throw new Error('Chat failed');

            const data = await res.json();
            this.appendMessage('model', data.response);

            // Update history
            this.chatHistory.push({ role: 'user', content: message });
            this.chatHistory.push({ role: 'model', content: data.response });

        } catch (e) {
            this.appendMessage('system', 'Error: ' + e.message);
        }
    }

    appendMessage(role, text) {
        const body = document.getElementById('chat-body');
        const div = document.createElement('div');
        div.className = `chat-message ${role}`;
        // Simple markdown-ish parsing for code blocks
        if (role === 'model' && text.includes('```')) {
            text = text.replace(/```([\s\S]*?)```/g, '<pre style="background:#eee;padding:10px;border-radius:6px;overflow-x:auto;">$1</pre>');
        }
        div.innerHTML = text;
        body.appendChild(div);
        body.scrollTop = body.scrollHeight;
    }

    /**
     * Show a toast notification.
     * @param {string} message - The message to display
     * @param {'success'|'error'|'warning'|'info'} type - Toast type
     * @param {number} duration - Auto-dismiss time in ms (0 = manual close only)
     */
    showToast(message, type = 'info', duration = 3500) {
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${this.escapeHtml(message)}</span>
            <button class="toast-close" title="Dismiss">&times;</button>
        `;

        const dismiss = () => {
            toast.classList.remove('show');
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 350);
        };

        toast.querySelector('.toast-close').addEventListener('click', dismiss);
        container.appendChild(toast);

        // Trigger entrance animation on next frame
        requestAnimationFrame(() => {
            requestAnimationFrame(() => toast.classList.add('show'));
        });

        if (duration > 0) {
            setTimeout(dismiss, duration);
        }
    }

    showLoading(type, subtitle = null) {
        const container = document.getElementById('studio-result');
        container.classList.add('active');
        const subtitleHtml = subtitle ? `<br><span style="font-size:12px;color:#666;">${subtitle}</span>` : '';
        document.getElementById('studio-content').innerHTML = `
            <div style="padding:20px;text-align:center;">
                <div style="margin-bottom:10px;">Generating ${type}...</div>
                <div class="loading-spinner" style="width:24px;height:24px;border:3px solid #e0e0e0;border-top-color:#009688;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto;"></div>
                ${subtitleHtml}
                <div style="margin-top:10px;font-size:11px;color:#999;">Please wait</div>
            </div>
            <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        `;
    }

    showError(msg) {
        document.getElementById('studio-content').innerHTML = `<div style="color:red;padding:20px;text-align:center;">Error: ${msg}</div>`;
    }

    escapeHtml(str = '') {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    escapeForJsString(str = '') {
        return str
            .replace(/\\/g, '\\\\')  // Escape backslashes first
            .replace(/'/g, "\\'")    // Escape single quotes
            .replace(/"/g, '\\"')    // Escape double quotes
            .replace(/\n/g, '\\n')   // Escape newlines
            .replace(/\r/g, '');     // Remove carriage returns
    }

    addToFavorites(prompt, btnElement) {
        if (this.app && this.app.addPromptToFavorites) {
            const success = this.app.addPromptToFavorites(prompt);
            if (success && btnElement) {
                const originalText = btnElement.textContent;
                btnElement.textContent = '❤️ Added!';
                btnElement.classList.add('studio-btn-success'); // Optional: add a success class if you have one
                setTimeout(() => {
                    btnElement.textContent = originalText;
                    btnElement.classList.remove('studio-btn-success');
                }, 1500);
            }
            return success;
        }
        return false;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    // Poll for the app instance to ensure it's ready, but don't wait forever
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds (100ms * 50)

    const initInterval = setInterval(() => {
        attempts++;
        // Check for either the new module instance or the legacy one
        const app = window.synthSmall || window.app;

        // If app is found OR we timeout
        if (app || attempts >= maxAttempts) {
            clearInterval(initInterval);

            if (!app) {
                console.warn('StudioIntegration: App instance not found after polling. Initializing with limited functionality.');
            }

            // Prevent multiple initializations
            if (!window.studioIntegration) {
                try {
                    window.studioIntegration = new StudioIntegration(app);
                    console.log('StudioIntegration: Initialized successfully');
                    // Init WorkflowRunner (workflows modal for Synthograsizer)
                    if (window.WorkflowRunner) {
                        window.workflowRunner = new WorkflowRunner(window.studioIntegration);
                        window.workflowRunner.init();
                    }
                } catch (e) {
                    console.error('StudioIntegration: Critical initialization error:', e);
                }
            }
        }
    }, 100);
});

/**
 * Global toast helper — available to all scripts.
 * Delegates to StudioIntegration instance if available, otherwise falls back.
 */
window.showToast = function(message, type, duration) {
    if (window.studioIntegrationInstance && window.studioIntegrationInstance.showToast) {
        window.studioIntegrationInstance.showToast(message, type || 'info', duration);
    } else {
        // Fallback if StudioIntegration hasn't loaded yet
        console.warn('[Toast fallback]', type, message);
    }
};
