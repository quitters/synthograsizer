// MIDI controller handling
import mitt from 'mitt';

export class MIDIController {
  constructor() {
    this.devices = new Map();
    this.controlMap = new Map();
    this.eventBus = mitt();
  }

  async initialize() {
    try {
      if (navigator.requestMIDIAccess) {
        const access = await navigator.requestMIDIAccess();
        this.setupListeners(access);
      } else {
        console.warn('WebMIDI not supported in this browser');
      }
    } catch (error) {
      console.warn('MIDI initialization failed:', error);
    }
  }

  setupListeners(access) {
    // Handle device connection/disconnection
    access.onstatechange = (e) => {
      if (e.port.type === 'input') {
        if (e.port.state === 'connected') {
          this.addDevice(e.port);
        } else {
          this.removeDevice(e.port.id);
        }
      }
    };

    // Setup existing devices
    access.inputs.forEach(input => this.addDevice(input));
  }

  addDevice(input) {
    this.devices.set(input.id, input);
    input.onmidimessage = this.handleMessage.bind(this);
    this.eventBus.emit('device-connected', {
      id: input.id,
      name: input.name
    });
  }

  removeDevice(id) {
    this.devices.delete(id);
    this.eventBus.emit('device-disconnected', { id });
  }

  handleMessage(message) {
    const [status, control, value] = message.data;
    const channel = status & 0x0F;
    const type = status & 0xF0;

    // Handle Control Change messages (0xB0)
    if (type === 0xB0) {
      this.eventBus.emit('midi-message', {
        type: 'cc',
        channel,
        control,
        value,
        timestamp: message.timeStamp
      });
    }
  }

  on(event, handler) {
    this.eventBus.on(event, handler);
    return () => this.eventBus.off(event, handler);
  }

  mapControl(channel, control, variableId) {
    const key = `${channel}-${control}`;
    this.controlMap.set(key, variableId);
  }

  unmapControl(channel, control) {
    const key = `${channel}-${control}`;
    this.controlMap.delete(key);
  }

  getMappingForCC(channel, control) {
    const key = `${channel}-${control}`;
    return this.controlMap.get(key);
  }

  clearAllMappings() {
    this.controlMap.clear();
  }
}
