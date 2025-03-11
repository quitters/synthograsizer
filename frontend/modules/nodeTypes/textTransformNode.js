import { store } from '../../store';
import { TextProcessor } from '../textProcessing/textProcessor';
import { BaseNode } from './baseNode';

export class TextTransformNode extends BaseNode {
    static type = 'text-transform';
    static category = 'Text';
    static defaultName = 'Text Transform';
    static defaultInputs = [
        ['input', { type: 'text', connections: [] }]
    ];
    static defaultOutputs = [
        ['output', { type: 'text', connections: [] }]
    ];
    static defaultOptions = {
        uppercase: false,
        lowercase: false,
        trim: false
    };
    static description = 'A node that transforms text using various operations';

    constructor(data = {}) {
        super(data);
        this.value = '';
    }

    onInputChange(port, value) {
        if (port === 'input') {
            this.value = this.transformText(value || '');
        }
    }

    getValue(port = 'output') {
        return this.value;
    }

    transformText(text) {
        let result = text;

        if (this.options.trim) {
            result = result.trim();
        }
        if (this.options.uppercase) {
            result = result.toUpperCase();
        }
        if (this.options.lowercase) {
            result = result.toLowerCase();
        }

        return result;
    }

    processInput() {
        const inputValue = this.getInputValue('input');
        if (inputValue !== null) {
            this.onInputChange('input', inputValue);
        }
    }
}
