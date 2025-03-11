import { store } from '../modules/store';
import { TooltipManager } from './TooltipManager';
import { ConnectionManager } from './ConnectionManager';
import { tokenProcessor } from '../modules/tokenProcessor';
import '../styles/hybrid-editor.css';

export class HybridPromptEditor {
    constructor(container, options = {}) {
        this.container = container;
        this.mode = options.mode || 'text'; // 'text' or 'visual'
        this.placeholder = options.placeholder || 'Enter text...';
        this.suggestions = [];
        this.activeToken = null;
        this.tooltipManager = new TooltipManager();
        this.connectionManager = null; // Initialized in visual mode
        this.processingTimeout = null;
        
        this.initializeUI();
        this.setupEventListeners();
    }

    initializeUI() {
        this.container.innerHTML = `
            <div class="hybrid-editor">
                <div class="editor-toolbar">
                    <div class="mode-toggles">
                        <button class="mode-toggle ${this.mode === 'text' ? 'active' : ''}" data-mode="text" title="Text Mode">
                            <i class="fas fa-font"></i>
                        </button>
                        <button class="mode-toggle ${this.mode === 'visual' ? 'active' : ''}" data-mode="visual" title="Visual Mode">
                            <i class="fas fa-project-diagram"></i>
                        </button>
                    </div>
                    <div class="editor-actions">
                        <button class="action-btn" data-action="suggest" title="Get Suggestions">
                            <i class="fas fa-magic"></i>
                        </button>
                        <button class="action-btn" data-action="clear" title="Clear Editor">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="editor-content">
                    <div class="text-editor ${this.mode === 'text' ? 'active' : ''}">
                        <div class="input-wrapper">
                            <textarea class="prompt-input" 
                                     placeholder="${this.placeholder}"></textarea>
                            <div class="syntax-highlight"></div>
                        </div>
                        <div class="token-suggestions"></div>
                    </div>
                    <div class="visual-editor ${this.mode === 'visual' ? 'active' : ''}">
                        <div class="node-canvas"></div>
                        <div class="parameter-sidebar"></div>
                    </div>
                </div>
            </div>
        `;

        // Get UI elements
        this.textEditor = this.container.querySelector('.text-editor');
        this.visualEditor = this.container.querySelector('.visual-editor');
        this.input = this.container.querySelector('.prompt-input');
        this.highlightLayer = this.container.querySelector('.syntax-highlight');
        this.suggestionsList = this.container.querySelector('.token-suggestions');
        this.nodeCanvas = this.container.querySelector('.node-canvas');
        this.parameterSidebar = this.container.querySelector('.parameter-sidebar');

        // Initialize connection manager if in visual mode
        if (this.mode === 'visual') {
            this.initializeVisualMode();
        }
    }

    setupEventListeners() {
        // Mode toggle
        this.container.querySelectorAll('.mode-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const newMode = btn.dataset.mode;
                this.setMode(newMode);
            });
        });

        // Editor actions
        this.container.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                this.handleAction(action);
            });
        });

        // Text input events
        this.input.addEventListener('input', () => {
            this.processInput();
        });

        this.input.addEventListener('keydown', (e) => {
            if (this.suggestionsList.style.display === 'block') {
                switch(e.key) {
                    case 'ArrowDown':
                        this.navigateSuggestions(1);
                        e.preventDefault();
                        break;
                    case 'ArrowUp':
                        this.navigateSuggestions(-1);
                        e.preventDefault();
                        break;
                    case 'Enter':
                    case 'Tab':
                        this.applySuggestion();
                        e.preventDefault();
                        break;
                    case 'Escape':
                        this.hideSuggestions();
                        break;
                }
            }
        });

        // Store events
        store.subscribe('tokenSuggestions', (suggestions) => {
            this.showSuggestions(suggestions);
        });

        store.subscribe('promptUpdate', (data) => {
            if (data.text !== undefined && data.source !== 'editor') {
                this.setValue(data.text, 'store');
            }
        });
    }

    setMode(mode) {
        if (mode === this.mode) return;

        this.mode = mode;
        this.container.querySelectorAll('.mode-toggle').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        this.textEditor.classList.toggle('active', mode === 'text');
        this.visualEditor.classList.toggle('active', mode === 'visual');

        if (mode === 'visual' && !this.connectionManager) {
            this.initializeVisualMode();
        }

        store.dispatch('editorModeChange', { mode });
    }

    initializeVisualMode() {
        this.connectionManager = new ConnectionManager(this.nodeCanvas);
        this.connectionManager.on('change', (nodes) => {
            const text = this.convertNodesToText(nodes);
            this.setValue(text, 'visual');
        });
    }

    handleAction(action) {
        switch (action) {
            case 'suggest':
                this.requestSuggestions();
                break;
            case 'clear':
                if (confirm('Clear the editor?')) {
                    this.setValue('');
                }
                break;
        }
    }

    processInput() {
        // Debounce processing
        clearTimeout(this.processingTimeout);
        this.processingTimeout = setTimeout(() => {
            const text = this.input.value;
            const cursorPos = this.input.selectionStart;
            
            const result = tokenProcessor.process(text);
            
            // Clear previous markers
            this.clearMarkers();
            
            // Add error/warning markers
            if (result.validation.errors.length > 0) {
                result.validation.errors.forEach(error => {
                    this.addMarker(error);
                });
            }
            
            // Update suggestions
            const suggestions = result.suggestions;
            if (suggestions.length > 0) {
                this.showSuggestions(suggestions);
            } else {
                this.hideSuggestions();
            }
            
            // Notify store of changes
            store.dispatch('updatePrompt', {
                text,
                isValid: result.validation.isValid,
                tokens: result.tokens
            });
            
        }, 150); // Debounce delay
    }

    addMarker(error) {
        const marker = document.createElement('div');
        marker.className = `token-error severity-${error.severity}`;
        marker.title = error.message;
        
        // Position marker under the error
        const coords = this.getTokenCoordinates(error.index);
        Object.assign(marker.style, {
            position: 'absolute',
            left: `${coords.left}px`,
            top: `${coords.top + coords.height}px`,
            width: `${coords.width}px`,
            height: '2px'
        });
        
        this.input.parentNode.appendChild(marker);
    }

    getTokenCoordinates(index) {
        // Create a temporary span to measure text
        const span = document.createElement('span');
        span.style.visibility = 'hidden';
        span.style.position = 'absolute';
        span.style.whiteSpace = 'pre';
        span.style.font = window.getComputedStyle(this.input).font;
        
        const text = this.input.value;
        span.textContent = text.substring(0, index);
        document.body.appendChild(span);
        
        const rect = span.getBoundingClientRect();
        const editorRect = this.input.getBoundingClientRect();
        
        document.body.removeChild(span);
        
        return {
            left: rect.width % editorRect.width,
            top: Math.floor(rect.width / editorRect.width) * parseInt(window.getComputedStyle(this.input).lineHeight),
            width: span.textContent.length * 8, // Approximate character width
            height: parseInt(window.getComputedStyle(this.input).lineHeight)
        };
    }

    clearMarkers() {
        const markers = this.input.parentNode.querySelectorAll('.token-error');
        markers.forEach(marker => marker.remove());
    }

    showSuggestions(suggestions) {
        const cursorPos = this.input.selectionStart;
        const coords = this.getTokenCoordinates(cursorPos);
        
        this.suggestionsList.innerHTML = '';
        suggestions.forEach((suggestion, index) => {
            const item = document.createElement('div');
            item.className = 'token-suggestion';
            if (index === 0) item.classList.add('selected');
            
            item.innerHTML = `
                <span class="token-name">${suggestion.token}</span>
                <span class="token-description">${suggestion.metadata.description || ''}</span>
            `;
            
            item.addEventListener('click', () => {
                this.applySuggestion(suggestion.token);
            });
            
            this.suggestionsList.appendChild(item);
        });
        
        // Position panel
        Object.assign(this.suggestionsList.style, {
            display: 'block',
            position: 'absolute',
            left: `${coords.left}px`,
            top: `${coords.top + coords.height}px`
        });
    }

    hideSuggestions() {
        this.suggestionsList.style.display = 'none';
    }

    navigateSuggestions(direction) {
        const items = this.suggestionsList.children;
        const currentIndex = Array.from(items).findIndex(item => item.classList.contains('selected'));
        
        items[currentIndex].classList.remove('selected');
        const newIndex = (currentIndex + direction + items.length) % items.length;
        items[newIndex].classList.add('selected');
    }

    applySuggestion(suggestionText) {
        if (!suggestionText) {
            const selected = this.suggestionsList.querySelector('.selected');
            if (!selected) return;
            suggestionText = selected.querySelector('.token-name').textContent;
        }
        
        const cursorPos = this.input.selectionStart;
        const text = this.input.value;
        const beforeCursor = text.slice(0, cursorPos);
        const afterCursor = text.slice(cursorPos);
        
        // Find the token being replaced
        const match = beforeCursor.match(/[\w\$\.]*$/);
        if (!match) return;
        
        const start = cursorPos - match[0].length;
        this.input.value = text.slice(0, start) + suggestionText + afterCursor;
        this.input.selectionStart = this.input.selectionEnd = start + suggestionText.length;
        
        this.hideSuggestions();
        this.processInput();
    }

    updateHighlighting(text) {
        const highlighted = this.highlightSyntax(text);
        this.highlightLayer.innerHTML = highlighted;
    }

    highlightSyntax(text) {
        return text.replace(/\{\{([^}]+)\}\}/g, (match, content) => {
            return `<span class="token">${match}</span>`;
        });
    }

    convertNodesToText(nodes) {
        // Convert visual nodes to text representation
        return nodes.map(node => {
            if (node.type === 'token') {
                return `{{${node.name}}}`;
            }
            return node.text;
        }).join(' ');
    }

    getValue() {
        return this.input.value;
    }

    setValue(value, source = 'user') {
        this.input.value = value;
        this.updateHighlighting(value);
        
        if (source !== 'store') {
            store.dispatch('updatePrompt', { text: value, source: 'editor' });
        }
        
        this.emit('change', value);
    }

    on(event, callback) {
        store.subscribe(event, callback);
    }

    emit(event, data) {
        store.dispatch(event, data);
    }
}
