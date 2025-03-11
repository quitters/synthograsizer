// Token Processing Pipeline
import { store } from '../store';

// Token Types
export const TokenType = {
    VARIABLE: 'variable',
    FUNCTION: 'function',
    MODIFIER: 'modifier',
    NUMBER: 'number',
    STRING: 'string',
    OPERATOR: 'operator'
};

// Token Patterns
const patterns = {
    variable: /\$[a-zA-Z_][a-zA-Z0-9_]*/,
    function: /[a-zA-Z_][a-zA-Z0-9_]*\(/,
    modifier: /\.[a-zA-Z_][a-zA-Z0-9_]*/,
    number: /-?\d*\.?\d+/,
    operator: /[\+\-\*\/\(\)]/,
    string: /"[^"]*"|'[^']*'/
};

// Trie for auto-completion
export class TokenTrie {
    constructor() {
        this.root = {};
        this.suggestions = new Map();
    }

    insert(token, metadata = {}) {
        let node = this.root;
        for (const char of token) {
            if (!node[char]) node[char] = {};
            node = node[char];
        }
        node.isEnd = true;
        node.metadata = metadata;
        this.suggestions.set(token, metadata);
    }

    search(prefix) {
        let node = this.root;
        for (const char of prefix) {
            if (!node[char]) return [];
            node = node[char];
        }
        const results = [];
        this._collectWords(node, prefix, results);
        return results;
    }

    _collectWords(node, prefix, results) {
        if (node.isEnd) {
            results.push({
                token: prefix,
                metadata: node.metadata
            });
        }
        for (const char in node) {
            if (char !== 'isEnd' && char !== 'metadata') {
                this._collectWords(node[char], prefix + char, results);
            }
        }
    }
}

// Token Validator
export class TokenValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
    }

    validate(tokens) {
        this.errors = [];
        this.warnings = [];
        
        let stack = [];
        let variableScope = new Set(store.getState().variables.map(v => v.name));

        tokens.forEach((token, index) => {
            switch (token.type) {
                case TokenType.VARIABLE:
                    if (!variableScope.has(token.value.slice(1))) {
                        this.errors.push({
                            index,
                            message: `Undefined variable: ${token.value}`,
                            severity: 'error'
                        });
                    }
                    break;

                case TokenType.FUNCTION:
                    stack.push('(');
                    break;

                case TokenType.OPERATOR:
                    if (token.value === '(') {
                        stack.push('(');
                    } else if (token.value === ')') {
                        if (stack.length === 0 || stack.pop() !== '(') {
                            this.errors.push({
                                index,
                                message: 'Mismatched parentheses',
                                severity: 'error'
                            });
                        }
                    }
                    break;
            }
        });

        if (stack.length > 0) {
            this.errors.push({
                index: tokens.length - 1,
                message: 'Unclosed parentheses',
                severity: 'error'
            });
        }

        return {
            isValid: this.errors.length === 0,
            errors: this.errors,
            warnings: this.warnings
        };
    }
}

// Token Parser
export class TokenParser {
    constructor() {
        this.position = 0;
        this.text = '';
        this.tokens = [];
    }

    parse(text) {
        this.text = text;
        this.position = 0;
        this.tokens = [];

        while (this.position < this.text.length) {
            const char = this.text[this.position];

            if (char === ' ' || char === '\t' || char === '\n') {
                this.position++;
                continue;
            }

            let matched = false;
            for (const [type, pattern] of Object.entries(patterns)) {
                const match = this.text.slice(this.position).match(pattern);
                if (match && match.index === 0) {
                    this.tokens.push({
                        type: TokenType[type.toUpperCase()],
                        value: match[0],
                        start: this.position,
                        end: this.position + match[0].length
                    });
                    this.position += match[0].length;
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                throw new Error(`Unexpected character at position ${this.position}: ${char}`);
            }
        }

        return this.tokens;
    }
}

// Token Processor
export class TokenProcessor {
    constructor() {
        this.parser = new TokenParser();
        this.validator = new TokenValidator();
        this.trie = new TokenTrie();
        this.initializeTrie();
    }

    initializeTrie() {
        // Add variables from store
        store.getState().variables.forEach(variable => {
            this.trie.insert(`$${variable.name}`, {
                type: TokenType.VARIABLE,
                description: variable.description || 'User-defined variable',
                defaultValue: variable.defaultValue
            });
        });

        // Add built-in functions
        const builtins = [
            { name: 'sin', description: 'Sine function' },
            { name: 'cos', description: 'Cosine function' },
            { name: 'tan', description: 'Tangent function' },
            { name: 'abs', description: 'Absolute value' },
            { name: 'min', description: 'Minimum value' },
            { name: 'max', description: 'Maximum value' }
        ];

        builtins.forEach(func => {
            this.trie.insert(func.name, {
                type: TokenType.FUNCTION,
                description: func.description
            });
        });
    }

    process(text) {
        try {
            const tokens = this.parser.parse(text);
            const validation = this.validator.validate(tokens);
            
            return {
                tokens,
                validation,
                suggestions: this.getSuggestions(text, this.parser.position)
            };
        } catch (error) {
            return {
                tokens: [],
                validation: {
                    isValid: false,
                    errors: [{
                        message: error.message,
                        severity: 'error'
                    }],
                    warnings: []
                },
                suggestions: []
            };
        }
    }

    getSuggestions(text, position) {
        // Find the token being typed
        const beforeCursor = text.slice(0, position);
        const match = beforeCursor.match(/[\w\$\.]*$/);
        if (!match) return [];

        const prefix = match[0];
        return this.trie.search(prefix).slice(0, 10); // Limit to 10 suggestions
    }

    addVariable(name, metadata = {}) {
        this.trie.insert(`$${name}`, {
            type: TokenType.VARIABLE,
            ...metadata
        });
    }

    removeVariable(name) {
        // Note: Current Trie implementation doesn't support removal
        // For now, we'll rebuild the trie
        this.trie = new TokenTrie();
        this.initializeTrie();
    }
}

// Create and export singleton instance
export const tokenProcessor = new TokenProcessor();

// Subscribe to store changes to keep variables in sync
store.subscribe(() => {
    const state = store.getState();
    if (state.variables) {
        tokenProcessor.trie = new TokenTrie();
        tokenProcessor.initializeTrie();
    }
});
