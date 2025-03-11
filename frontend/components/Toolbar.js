import { store } from '../modules/store';

export class Toolbar {
  constructor(container) {
    this.container = container;
    this.initializeUI();
    this.setupEventListeners();
  }

  initializeUI() {
    this.container.innerHTML = `
      <div class="toolbar-section">
        <button class="toolbar-btn" data-action="new">
          <i class="fas fa-file"></i>
          New
        </button>
        <button class="toolbar-btn" data-action="open">
          <i class="fas fa-folder-open"></i>
          Open
        </button>
        <button class="toolbar-btn" data-action="save">
          <i class="fas fa-save"></i>
          Save
        </button>
      </div>
      
      <div class="toolbar-section">
        <button class="toolbar-btn" data-action="undo">
          <i class="fas fa-undo"></i>
          Undo
        </button>
        <button class="toolbar-btn" data-action="redo">
          <i class="fas fa-redo"></i>
          Redo
        </button>
      </div>
      
      <div class="toolbar-section midi-section">
        <select class="midi-device-select">
          <option value="">Select MIDI Device</option>
        </select>
        <button class="toolbar-btn" data-action="midi-learn">
          <i class="fas fa-music"></i>
          MIDI Learn
        </button>
      </div>
      
      <div class="toolbar-section">
        <button class="toolbar-btn" data-action="settings">
          <i class="fas fa-cog"></i>
          Settings
        </button>
      </div>
    `;

    // Add tooltip support
    this.container.querySelectorAll('.toolbar-btn').forEach(btn => {
      const action = btn.dataset.action;
      btn.title = this.getTooltip(action);
    });
  }

  setupEventListeners() {
    this.container.addEventListener('click', e => {
      const btn = e.target.closest('.toolbar-btn');
      if (!btn) return;

      const action = btn.dataset.action;
      this.handleAction(action);
    });

    // MIDI device selection
    const midiSelect = this.container.querySelector('.midi-device-select');
    midiSelect.addEventListener('change', () => {
      const deviceId = midiSelect.value;
      if (deviceId) {
        store.midiController.selectDevice(deviceId);
      }
    });

    // Listen for MIDI device changes
    store.emitter.on('midi-devices-changed', () => {
      this.updateMIDIDevices();
    });
  }

  handleAction(action) {
    switch (action) {
      case 'new':
        if (confirm('Create new project? Unsaved changes will be lost.')) {
          store.resetState();
        }
        break;
        
      case 'open':
        this.openFileDialog();
        break;
        
      case 'save':
        this.saveProject();
        break;
        
      case 'undo':
        store.history.undo();
        break;
        
      case 'redo':
        store.history.redo();
        break;
        
      case 'midi-learn':
        this.toggleMIDILearn();
        break;
        
      case 'settings':
        this.showSettings();
        break;
    }
  }

  openFileDialog() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.synth';
    
    input.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        store.loadProject(data);
        store.emitter.emit('status-message', 'Project loaded successfully');
      } catch (err) {
        store.emitter.emit('status-message', 'Error loading project: ' + err.message);
      }
    });
    
    input.click();
  }

  async saveProject() {
    const data = store.serializeProject();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project.synth';
    a.click();
    
    URL.revokeObjectURL(url);
    store.emitter.emit('status-message', 'Project saved successfully');
  }

  toggleMIDILearn() {
    const btn = this.container.querySelector('[data-action="midi-learn"]');
    const isLearning = store.midiController.toggleLearnMode();
    
    btn.classList.toggle('active', isLearning);
    store.emitter.emit('status-message', 
      isLearning ? 'MIDI Learn mode active' : 'MIDI Learn mode disabled'
    );
  }

  showSettings() {
    // Create settings dialog
    const dialog = document.createElement('div');
    dialog.className = 'dialog settings-dialog';
    dialog.innerHTML = `
      <div class="dialog-content">
        <h2>Settings</h2>
        <form class="settings-form">
          <div class="form-group">
            <label>Auto-save interval (minutes):</label>
            <input type="number" name="autoSaveInterval" min="1" max="60" 
                   value="${store.settings.autoSaveInterval}">
          </div>
          <div class="form-group">
            <label>MIDI velocity sensitivity:</label>
            <input type="range" name="midiVelocitySensitivity" min="0" max="1" step="0.1"
                   value="${store.settings.midiVelocitySensitivity}">
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" name="showConnectionPreviews"
                     ${store.settings.showConnectionPreviews ? 'checked' : ''}>
              Show connection previews
            </label>
          </div>
          <div class="dialog-buttons">
            <button type="submit">Save</button>
            <button type="button" class="cancel-btn">Cancel</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(dialog);

    const form = dialog.querySelector('form');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const formData = new FormData(form);
      
      store.updateSettings({
        autoSaveInterval: parseInt(formData.get('autoSaveInterval')),
        midiVelocitySensitivity: parseFloat(formData.get('midiVelocitySensitivity')),
        showConnectionPreviews: formData.get('showConnectionPreviews') === 'on'
      });
      
      document.body.removeChild(dialog);
      store.emitter.emit('status-message', 'Settings updated');
    });

    dialog.querySelector('.cancel-btn').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });
  }

  async updateMIDIDevices() {
    const select = this.container.querySelector('.midi-device-select');
    const devices = await store.midiController.getDevices();
    
    select.innerHTML = `
      <option value="">Select MIDI Device</option>
      ${devices.map(device => `
        <option value="${device.id}">${device.name}</option>
      `).join('')}
    `;
  }

  getTooltip(action) {
    const tooltips = {
      new: 'Create new project (Ctrl+N)',
      open: 'Open project (Ctrl+O)',
      save: 'Save project (Ctrl+S)',
      undo: 'Undo (Ctrl+Z)',
      redo: 'Redo (Ctrl+Y)',
      'midi-learn': 'Enter MIDI Learn mode (M)',
      settings: 'Open settings'
    };
    return tooltips[action] || '';
  }
}
