// TextRenderer - Handles colored text generation and clipboard operations

export class TextRenderer {
  constructor(outputElement) {
    this.outputElement = outputElement;
  }

  /**
   * Renders template with color-coded variables
   * @param {string} template - Template string with {{placeholders}}
   * @param {Object} variableMap - Map of variable names to current values
   * @param {Object} colorMap - Map of variable names to colors
   * @param {string} currentVariableName - Name of currently selected variable (feature_name)
   * @returns {string} HTML string with colored spans
   */
  renderColoredText(template, variableMap, colorMap, currentVariableName = null) {
    let html = template;

    // Color class mapping
    const colorToClass = {
      '#3b82f6': 'var-blue',
      '#f59e0b': 'var-yellow',
      '#f97316': 'var-orange',
      '#ec4899': 'var-pink',
      '#8b5cf6': 'var-purple',
      '#06b6d4': 'var-cyan',
      '#10b981': 'var-green',
      '#ef4444': 'var-red'
    };

    // Replace each {{variable}} with colored <span>
    Object.keys(variableMap).forEach(varName => {
      const value = variableMap[varName];
      const color = colorMap[varName] || '#666';
      const colorClass = colorToClass[color] || '';

      // Escape special regex characters in variable name
      const escapedVarName = varName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`{{${escapedVarName}}}`, 'g');

      // Add 'variable-highlighted' class if this is the current variable
      const highlightClass = (varName === currentVariableName) ? 'variable-highlighted' : '';

      html = html.replace(
        regex,
        `<span class="variable-value ${colorClass} ${highlightClass}">${value}</span>`
      );
    });

    return html;
  }

  /**
   * Renders the prompt template with colored {{var}} tokens for inline editing.
   * Static text is plain/editable; variable tokens are contenteditable=false spans.
   */
  renderEditableTemplate(template, colorMap) {
    const colorToClass = {
      '#3b82f6': 'var-blue', '#f59e0b': 'var-yellow', '#f97316': 'var-orange',
      '#ec4899': 'var-pink', '#8b5cf6': 'var-purple', '#06b6d4': 'var-cyan',
      '#10b981': 'var-green', '#ef4444': 'var-red'
    };
    const regex = /\{\{([^}]+)\}\}/g;
    let result = '', lastIndex = 0, match;
    while ((match = regex.exec(template)) !== null) {
      const before = template.slice(lastIndex, match.index);
      if (before) result += this._escapeAndBreak(before);
      const varName = match[1];
      const colorClass = colorToClass[colorMap[varName] || ''] || '';
      result += `<span class="var-token variable-value ${colorClass}" contenteditable="false" data-var="${varName}">{{${varName}}}</span>`;
      lastIndex = match.index + match[0].length;
    }
    const after = template.slice(lastIndex);
    if (after) result += this._escapeAndBreak(after);
    return result;
  }

  _escapeAndBreak(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }

  /**
   * Walks the contenteditable DOM and reconstructs the template string,
   * preserving {{var}} tokens from var-token spans and converting <br>/<div> to \n.
   */
  extractTemplate() {
    let template = '';
    const walk = (nodes) => {
      nodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          template += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.classList.contains('var-token')) {
            template += `{{${node.dataset.var}}}`;
          } else if (node.tagName === 'BR') {
            template += '\n';
          } else if (node.tagName === 'DIV' || node.tagName === 'P') {
            if (template.length > 0) template += '\n';
            walk(Array.from(node.childNodes));
          } else {
            walk(Array.from(node.childNodes));
          }
        }
      });
    };
    walk(Array.from(this.outputElement.childNodes));
    return template;
  }

  /**
   * Updates the output display
   * @param {string} html - HTML string to display
   */
  updateDisplay(html) {
    // Use requestAnimationFrame for smooth 60fps updates
    requestAnimationFrame(() => {
      this.outputElement.innerHTML = html;
    });
  }

  /**
   * Gets plain text version (no HTML tags)
   * @returns {string} Plain text
   */
  getPlainText() {
    return this.outputElement.textContent || this.outputElement.innerText || '';
  }

  /**
   * Copies plain text to clipboard
   * @returns {Promise<boolean>} Success status
   */
  async copyToClipboard() {
    const text = this.getPlainText();

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        // Fallback for older browsers
        return this.fallbackCopy(text);
      }
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      return this.fallbackCopy(text);
    }
  }

  /**
   * Fallback copy method for browsers without Clipboard API
   * @param {string} text - Text to copy
   * @returns {boolean} Success status
   */
  fallbackCopy(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (error) {
      console.error('Fallback copy failed:', error);
      document.body.removeChild(textArea);
      return false;
    }
  }
}
