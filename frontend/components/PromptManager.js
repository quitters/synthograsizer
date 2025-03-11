import { store } from '../modules/store';
import { HybridPromptEditor } from './HybridPromptEditor';
import '../styles/prompt.css';

export class PromptManager {
    constructor(container) {
        this.container = container;
        this.initializeUI();
        this.setupEventListeners();
    }

    initializeUI() {
        this.container.innerHTML = `
            <div class="prompt-manager">
                <div class="prompt-sidebar ${store.state.sidebarCollapsed ? 'collapsed' : ''}">
                    <div class="sidebar-header">
                        <h3>Properties</h3>
                        <button class="collapse-btn" title="Toggle Sidebar">
                            <i class="fas fa-chevron-left"></i>
                        </button>
                    </div>
                    <div class="sidebar-content">
                        <div class="prompt-selector">
                            <button class="prompt-tab active" data-prompt="main">Main Prompt</button>
                            <button class="prompt-tab" data-prompt="negative">Negative Prompt</button>
                        </div>
                        <div class="prompt-properties">
                            <div class="property-group">
                                <h4>Settings</h4>
                                <div class="property-item">
                                    <label>Prompt Strength</label>
                                    <input type="range" min="0" max="100" value="100">
                                </div>
                                <div class="property-item">
                                    <label>Token Weight</label>
                                    <input type="range" min="0" max="200" value="100">
                                </div>
                            </div>
                            <div class="property-group">
                                <h4>Variables</h4>
                                <div class="variable-list"></div>
                                <button class="add-variable-btn">
                                    <i class="fas fa-plus"></i> Add Variable
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="prompt-workspace">
                    <div class="workspace-header">
                        <div class="prompt-tabs">
                            <button class="tab-btn active" data-editor="main">
                                Main Prompt
                                <span class="token-count">0 tokens</span>
                            </button>
                            <button class="tab-btn" data-editor="negative">
                                Negative Prompt
                                <span class="token-count">0 tokens</span>
                            </button>
                        </div>
                        <div class="workspace-actions">
                            <button class="action-btn" title="Split View">
                                <i class="fas fa-columns"></i>
                            </button>
                            <button class="action-btn" title="Clear All">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="editors-container">
                        <div class="editor-wrapper active" data-editor="main">
                            <div id="mainPromptEditor" class="prompt-editor"></div>
                            <div class="editor-footer">
                                <div class="token-suggestions"></div>
                                <div class="editor-stats">
                                    <span class="char-count">0 chars</span>
                                </div>
                            </div>
                        </div>
                        <div class="editor-wrapper" data-editor="negative">
                            <div id="negativePromptEditor" class="prompt-editor"></div>
                            <div class="editor-footer">
                                <div class="token-suggestions"></div>
                                <div class="editor-stats">
                                    <span class="char-count">0 chars</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Initialize editors
        this.mainEditor = new HybridPromptEditor(
            this.container.querySelector('#mainPromptEditor'),
            {
                placeholder: 'Enter your prompt here...',
                mode: 'hybrid'
            }
        );

        this.negativeEditor = new HybridPromptEditor(
            this.container.querySelector('#negativePromptEditor'),
            {
                placeholder: 'Enter negative prompt here...',
                mode: 'hybrid'
            }
        );

        // Cache DOM elements
        this.sidebar = this.container.querySelector('.prompt-sidebar');
        this.editorsContainer = this.container.querySelector('.editors-container');
        this.mainWrapper = this.container.querySelector('[data-editor="main"]');
        this.negativeWrapper = this.container.querySelector('[data-editor="negative"]');
    }

    setupEventListeners() {
        // Sidebar toggle
        this.container.querySelector('.collapse-btn').addEventListener('click', () => {
            this.sidebar.classList.toggle('collapsed');
            store.dispatch('updateUI', { sidebarCollapsed: this.sidebar.classList.contains('collapsed') });
        });

        // Tab switching
        this.container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const editor = btn.dataset.editor;
                this.switchEditor(editor);
            });
        });

        // Split view toggle
        this.container.querySelector('[title="Split View"]').addEventListener('click', () => {
            this.editorsContainer.classList.toggle('split');
            if (this.editorsContainer.classList.contains('split')) {
                this.mainWrapper.classList.add('active');
                this.negativeWrapper.classList.add('active');
            } else {
                this.negativeWrapper.classList.remove('active');
            }
        });

        // Clear prompts
        this.container.querySelector('[title="Clear All"]').addEventListener('click', () => {
            if (confirm('Clear all prompts?')) {
                this.mainEditor.setValue('');
                this.negativeEditor.setValue('');
                store.dispatch('updatePrompt', {
                    mainPrompt: '',
                    negativePrompt: ''
                });
            }
        });

        // Editor events
        this.mainEditor.on('change', (value) => {
            store.dispatch('updatePrompt', { mainPrompt: value });
            this.updateStats('main');
        });

        this.negativeEditor.on('change', (value) => {
            store.dispatch('updatePrompt', { negativePrompt: value });
            this.updateStats('negative');
        });

        // Store events
        store.subscribe('promptUpdate', (data) => {
            this.updateFromStore(data);
        });

        store.subscribe('tokenSuggestions', (suggestions) => {
            this.showSuggestions(suggestions);
        });
    }

    switchEditor(editor) {
        // Update tab buttons
        this.container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.editor === editor);
        });

        // Update editor wrappers
        if (!this.editorsContainer.classList.contains('split')) {
            this.container.querySelectorAll('.editor-wrapper').forEach(wrapper => {
                wrapper.classList.toggle('active', wrapper.dataset.editor === editor);
            });
        }
    }

    updateStats(editor) {
        const wrapper = this.container.querySelector(`[data-editor="${editor}"]`);
        const text = editor === 'main' ? this.mainEditor.getValue() : this.negativeEditor.getValue();
        
        const tokenCount = this.countTokens(text);
        const charCount = text.length;

        wrapper.querySelector('.char-count').textContent = `${charCount} chars`;
        this.container.querySelector(`.tab-btn[data-editor="${editor}"] .token-count`)
            .textContent = `${tokenCount} tokens`;
    }

    showSuggestions(suggestions) {
        const activeEditor = this.editorsContainer.classList.contains('split') ? 'both' : 
            this.mainWrapper.classList.contains('active') ? 'main' : 'negative';

        const updateSuggestions = (container) => {
            container.innerHTML = suggestions.map(s => `
                <div class="token-suggestion" data-token="${s.token}">
                    <span class="token-name">${s.name}</span>
                    <span class="token-description">${s.description}</span>
                </div>
            `).join('');
        };

        if (activeEditor === 'both' || activeEditor === 'main') {
            updateSuggestions(this.mainWrapper.querySelector('.token-suggestions'));
        }
        if (activeEditor === 'both' || activeEditor === 'negative') {
            updateSuggestions(this.negativeWrapper.querySelector('.token-suggestions'));
        }
    }

    updateFromStore(data) {
        if (data.mainPrompt !== undefined) {
            this.mainEditor.setValue(data.mainPrompt, 'store');
            this.updateStats('main');
        }
        if (data.negativePrompt !== undefined) {
            this.negativeEditor.setValue(data.negativePrompt, 'store');
            this.updateStats('negative');
        }
    }

    countTokens(text) {
        return text.split(/\s+/).filter(t => t.length > 0).length;
    }
}
