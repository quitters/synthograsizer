import { store } from './store.js';

export const AppMode = {
    VARIABLE_SELECT: 'variable-select',
    PARAMETER_TWEAK: 'parameter-tweak',
    VARIABLE_EDIT: 'variable-edit',
    VISUAL_PROGRAMMING: 'visual-programming'
};

export class ModeManager {
    constructor() {
        this.modeHandlers = {
            [AppMode.VARIABLE_SELECT]: this.enterVariableSelect,
            [AppMode.PARAMETER_TWEAK]: this.enterParameterTweak,
            [AppMode.VARIABLE_EDIT]: this.enterVariableEdit,
            [AppMode.VISUAL_PROGRAMMING]: this.enterVisualProgramming
        };

        this.currentMode = AppMode.VARIABLE_SELECT;
    }

    enterMode(mode) {
        if (this.modeHandlers[mode]) {
            this.currentMode = mode;
            this.modeHandlers[mode].call(this);
            store.setMode(mode);
        }
    }

    enterVariableSelect() {
        // Enable variable selection UI elements
        document.body.classList.remove('parameter-tweak-mode', 'variable-edit-mode', 'visual-programming-mode');
        document.body.classList.add('variable-select-mode');
    }

    enterParameterTweak() {
        // Enable parameter adjustment UI elements
        document.body.classList.remove('variable-select-mode', 'variable-edit-mode', 'visual-programming-mode');
        document.body.classList.add('parameter-tweak-mode');
    }

    enterVariableEdit() {
        // Enable variable editing UI elements
        document.body.classList.remove('variable-select-mode', 'parameter-tweak-mode', 'visual-programming-mode');
        document.body.classList.add('variable-edit-mode');
    }

    enterVisualProgramming() {
        // Enable visual programming UI elements
        document.body.classList.remove('variable-select-mode', 'parameter-tweak-mode', 'variable-edit-mode');
        document.body.classList.add('visual-programming-mode');
    }

    getCurrentMode() {
        return this.currentMode;
    }
}
