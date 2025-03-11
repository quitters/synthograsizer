import { store } from '../modules/store';
import { PromptManager } from './PromptManager';
import { VariablesPanel } from './VariablesPanel';
import { ParametersPanel } from './ParametersPanel';
import { CanvasArea } from './CanvasArea';
import { StatusBar } from './StatusBar';
import { Toolbar } from './Toolbar';
import { NodeEditor } from './NodeEditor';
import { VariablePanel } from './VariablePanel';
import '../styles/ui.css';

export class App {
    constructor(container) {
        this.container = container;
        this.components = {};
        
        this.initializeUI();
        this.initComponents();
        this.setupEventListeners();
    }

    initializeUI() {
        this.container.innerHTML = `
            <div class="synthograsizer-app">
                <div id="toolbar" class="toolbar"></div>
                <div class="main-content">
                    <div id="variable-panel" class="variable-panel"></div>
                    <div class="editor-area">
                        <div id="prompt-manager" class="prompt-manager"></div>
                        <div id="node-editor" class="node-editor"></div>
                    </div>
                </div>
                <div id="status-bar" class="status-bar"></div>
            </div>
        `;
    }

    initComponents() {
        // Initialize toolbar
        this.components.toolbar = new Toolbar(
            this.container.querySelector('#toolbar')
        );

        // Initialize prompt manager
        this.components.promptManager = new PromptManager(
            this.container.querySelector('#prompt-manager')
        );

        // Initialize node editor
        this.components.nodeEditor = new NodeEditor(
            this.container.querySelector('#node-editor')
        );

        // Initialize variables panel
        this.components.variablesPanel = new VariablesPanel(
            this.container.querySelector('#variable-panel')
        );

        // Initialize status bar
        this.components.statusBar = new StatusBar(
            this.container.querySelector('#status-bar')
        );
    }

    setupEventListeners() {
        // Listen for prompt changes
        this.components.promptManager.on('promptChange', (data) => {
            // Update canvas or other components based on prompt changes
            this.components.nodeEditor.updateFromPrompt(data);
        });

        // Listen for variable changes
        store.eventBus.on('variable-updated', ({ id, value }) => {
            this.components.promptManager.updateOutputs({
                mainPrompt: this.generatePromptFromVariables()
            });
        });

        // Listen for MIDI updates
        store.eventBus.on('midiMappingUpdate', (data) => {
            this.components.statusBar.showMessage(`MIDI Control ${data.control} mapped to ${data.target}`);
        });

        // Listen for errors
        window.addEventListener('error', (event) => {
            this.components.statusBar.showError(event.error.message);
        });

        // Global events
        store.eventBus.on('connection-created', () => {
            this.components.statusBar.showMessage('Connection created');
        });

        store.eventBus.on('connection-removed', () => {
            this.components.statusBar.showMessage('Connection removed');
        });

        // Window resize handling
        window.addEventListener('resize', () => {
            // this.connectionRenderer.resize();
        });
    }

    generatePromptFromVariables() {
        const variables = Array.from(store.getState().variables.values());
        return variables.map(v => `${v.name}:${v.value}`).join(' ');
    }

    // Public API
    getComponent(name) {
        return this.components[name];
    }

    destroy() {
        // Cleanup all components
        Object.values(this.components).forEach(component => {
            if (component.destroy) {
                component.destroy();
            }
        });
    }

    addVariable(config) {
        return this.components.variablesPanel.addVariable(config);
    }

    removeVariable(id) {
        this.components.variablesPanel.removeVariable(id);
    }

    setStatus(message) {
        this.components.statusBar.showMessage(message);
    }
}
