/**
 * Prompt Templating System for Synthograsizer
 * 
 * This module enables users to convert words or phrases from prompts into 
 * variables for use in Synthograsizer templates.
 */

class PromptTemplater {
  constructor() {
    this.variables = [];
    this.selections = [];
    this.originalPrompt = '';
    this.container = null;
    this.templatePreview = null;
  }

  /**
   * Initialize the templater with a prompt and container
   * @param {string} prompt - The original prompt text
   * @param {HTMLElement} container - The container for the templating interface
   */
  initialize(prompt, container) {
    this.variables = [];
    this.selections = [];
    this.originalPrompt = prompt;
    this.container = container;
    this.isDragging = false;
    this.dragStart = null;
    this.hasMoved = false;  // Track if mouse moved during drag
    this.lastSelected = null;
    this.selectedForDeletion = null;
    
    // Clear the container
    container.innerHTML = '';
    
    // Create the interface
    this.createInterface();
    
    // Add keyboard event listener for delete key
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('click', this.handleDocumentClick.bind(this));
  }
  
  /**
   * Handle document clicks to clear delete mode
   */
  handleDocumentClick(e) {
    // If clicking anywhere other than the last selected word, clear deletion mode
    if (this.selectedForDeletion && !e.target.classList.contains('selected')) {
      this.selectedForDeletion = null;
    }
  }
  
  /**
   * Handle keyboard events for word deletion
   */
  handleKeyDown(e) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.selectedForDeletion) {
        this.deleteWord(this.selectedForDeletion);
        e.preventDefault();
      }
    }
  }
  
  /**
   * Delete a selected word and remove it from the prompt
   */
  deleteWord(wordElement) {
    const index = parseInt(wordElement.dataset.index);
    
    // Find which selection this word belongs to
    const selectionIndex = this.selections.findIndex(sel => 
      index >= sel.start && index <= sel.end
    );
    
    if (selectionIndex >= 0) {
      // Remove the variable and selection
      this.variables.splice(selectionIndex, 1);
      this.selections.splice(selectionIndex, 1);
      
      // Remove the word from the DOM
      wordElement.remove();
      
      // Update the indexes of subsequent elements
      const allSpans = this.container.querySelectorAll('span[data-index]');
      allSpans.forEach(span => {
        const spanIndex = parseInt(span.dataset.index);
        if (spanIndex > index) {
          span.dataset.index = spanIndex - 1;
        }
      });
      
      // Reconstruct the original prompt without the deleted word
      const promptSpans = Array.from(this.container.querySelectorAll('#promptSection span'));
      this.originalPrompt = promptSpans.map(span => span.textContent).join('');
      
      // Update the UI
      this.updateVariablesList();
      this.updateTemplatePreview();
      
      // Clear delete mode
      this.selectedForDeletion = null;
    }
  }
  
  /**
   * Create the templating interface
   */
  createInterface() {
    const interfaceContainer = document.createElement('div');
    interfaceContainer.style.padding = '10px';
    
    // Create a heading
    const heading = document.createElement('h3');
    heading.textContent = 'Create Template from Prompt';
    heading.style.marginTop = '0';
    heading.style.marginBottom = '15px';
    heading.style.fontSize = '1.3em';
    heading.style.color = '#333';
    interfaceContainer.appendChild(heading);
    
    // Instructions (collapsible)
    const instructionsContainer = document.createElement('div');
    instructionsContainer.style.marginBottom = '15px';
    instructionsContainer.style.border = '1px solid #e2e8f0';
    instructionsContainer.style.borderRadius = '4px';
    instructionsContainer.style.overflow = 'hidden';
    
    // Instructions header (always visible)
    const instructionsHeader = document.createElement('div');
    instructionsHeader.style.display = 'flex';
    instructionsHeader.style.justifyContent = 'space-between';
    instructionsHeader.style.alignItems = 'center';
    instructionsHeader.style.padding = '8px 12px';
    instructionsHeader.style.backgroundColor = '#f8fafc';
    instructionsHeader.style.borderBottom = '1px solid #e2e8f0';
    instructionsHeader.style.cursor = 'pointer';
    
    // Header title
    const instructionsTitle = document.createElement('div');
    instructionsTitle.textContent = 'Instructions';
    instructionsTitle.style.fontWeight = '500';
    instructionsTitle.style.color = '#4b5563';
    instructionsHeader.appendChild(instructionsTitle);
    
    // Toggle icon
    const toggleIcon = document.createElement('span');
    toggleIcon.innerHTML = '&#9660;'; // Down arrow
    toggleIcon.style.fontSize = '12px';
    toggleIcon.style.color = '#64748b';
    toggleIcon.style.transition = 'transform 0.2s';
    instructionsHeader.appendChild(toggleIcon);
    
    // Instructions content (collapsible)
    const instructionsContent = document.createElement('div');
    instructionsContent.style.padding = '12px 15px';
    instructionsContent.style.backgroundColor = '#f0f7ff';
    instructionsContent.style.borderLeft = '3px solid #93c5fd';
    instructionsContent.style.lineHeight = '1.5';
    instructionsContent.style.color = '#444';
    instructionsContent.style.display = 'none'; // Start collapsed
    
    // Main instruction text
    instructionsContent.innerHTML = `
      <p style="margin:0 0 10px 0;font-weight:500;">How to create and edit your template:</p>
      <ul style="margin:0;padding-left:20px;">
        <li><strong>Select variables:</strong> Click on any word or drag across multiple words to create a variable</li>
        <li><strong>Delete variables:</strong> Click on a selected word to remove it</li>
        <li><strong>Preview template:</strong> Use the buttons above the preview area to toggle between Template view (with {{variables}}) and Example view</li>
        <li><strong>Generate examples:</strong> Click the dice icon in Example view to randomize the values</li>
      </ul>
    `;
    
    // Add toggle functionality
    instructionsHeader.addEventListener('click', () => {
      const isExpanded = instructionsContent.style.display !== 'none';
      
      if (isExpanded) {
        // Collapse
        instructionsContent.style.display = 'none';
        toggleIcon.innerHTML = '&#9660;'; // Down arrow
        toggleIcon.style.transform = 'rotate(0deg)';
      } else {
        // Expand
        instructionsContent.style.display = 'block';
        toggleIcon.innerHTML = '&#9650;'; // Up arrow
        toggleIcon.style.transform = 'rotate(0deg)';
      }
    });
    
    // Assemble the instructions container
    instructionsContainer.appendChild(instructionsHeader);
    instructionsContainer.appendChild(instructionsContent);
    
    interfaceContainer.appendChild(instructionsContainer);
    
    // Create a section for the prompt
    const promptSection = document.createElement('div');
    promptSection.style.marginBottom = '20px';
    promptSection.style.padding = '15px';
    promptSection.style.backgroundColor = '#f9f9f9';
    promptSection.style.border = '1px solid #eee';
    promptSection.style.borderRadius = '6px';
    promptSection.id = 'promptSelectionArea';
    
    // Split the prompt into words
    // Important: We're separating by space and preserving the spaces
    const regex = /(\S+)(\s*)/g;
    let match;
    let index = 0;
    let words = [];
    
    // This will split into actual words and preserve spaces
    while ((match = regex.exec(this.originalPrompt)) !== null) {
      words.push({ text: match[1], type: 'word', index: index++ }); // The word
      if (match[2]) { // The whitespace (if any)
        words.push({ text: match[2], type: 'space', index: index++ });
      }
    }
    
    // Create a span for each word to make them selectable
    words.forEach((word) => {
      const span = document.createElement('span');
      span.textContent = word.text;
      span.dataset.index = word.index;
      span.dataset.type = word.type;
      
      if (word.type === 'word') { // Only make actual words selectable, not spaces
        span.classList.add('word-span'); // Add class for selection targeting
        span.style.cursor = 'pointer';
        span.style.position = 'relative';
        span.style.transition = 'all 0.2s';
        span.style.borderRadius = '3px';
        span.style.padding = '1px';
        
        // Add hover effect
        span.addEventListener('mouseenter', () => {
          if (!span.classList.contains('selected')) {
            span.style.backgroundColor = '#f0f4ff';
          }
        });
        span.addEventListener('mouseleave', () => {
          if (!span.classList.contains('selected')) {
            span.style.backgroundColor = 'transparent';
          }
        });
        
        // Add mouse event handlers for multi-word selection
        span.addEventListener('mousedown', (e) => {
          e.preventDefault(); // Prevent text selection
          
          // Start a new drag operation
          this.isDragging = true;
          this.hasMoved = false; // Reset movement tracking
          this.dragStart = parseInt(span.dataset.index);
          
          // Add temporary highlight to show it's being dragged
          if (!span.classList.contains('selected')) {
            span.style.backgroundColor = 'rgba(147, 197, 253, 0.3)';
          }
        });
        
        span.addEventListener('mouseover', () => {
          if (this.isDragging && this.dragStart !== null) {
            // If dragging over a word, create a selection range
            const currentIndex = parseInt(span.dataset.index);
            
            // Clear any existing temporary selection styling
            const allWordSpans = this.container.querySelectorAll('span[data-type="word"]');
            allWordSpans.forEach(wordSpan => {
              if (!wordSpan.classList.contains('selected')) {
                wordSpan.style.backgroundColor = 'transparent';
              }
            });
            
            // Highlight the range being dragged over
            const start = Math.min(this.dragStart, currentIndex);
            const end = Math.max(this.dragStart, currentIndex);
            
            for (let i = start; i <= end; i++) {
              const wordSpan = this.container.querySelector(`span[data-index="${i}"][data-type="word"]`);
              if (wordSpan && !wordSpan.classList.contains('selected')) {
                wordSpan.style.backgroundColor = '#f0f4ff';
              }
            }
          }
        });
        
        // Remove the click handler - we'll handle selection entirely through mousedown/mouseup
        // to avoid conflicts between click and drag operations
      }
      
      promptSection.appendChild(span);
    });
    
    // Track mouse movement during drag
    document.addEventListener('mousemove', (e) => {
      if (this.isDragging && !this.hasMoved) {
        // Mark that we've moved during this drag operation
        this.hasMoved = true;
      }
    });
    
    // Add global mouseup handler to complete selection
    document.addEventListener('mouseup', (e) => {
      if (this.isDragging && this.dragStart !== null) {
        // Find the specific element under the cursor at mouseup position
        let mouseupTarget = document.elementFromPoint(e.clientX, e.clientY);
        
        // Check for valid target
        if (mouseupTarget && mouseupTarget.classList.contains('word-span') && 
            mouseupTarget.dataset && mouseupTarget.dataset.index) {
          
          const startIndex = this.dragStart;
          const endIndex = parseInt(mouseupTarget.dataset.index);
          
          // Single click (start and end on same word without movement)
          if (startIndex === endIndex && !this.hasMoved) {
            // Handle as a single click - toggle selection
            if (mouseupTarget.classList.contains('selected')) {
              // If already selected, deselect it (remove the variable)
              this.deselectWord(mouseupTarget);
            } else {
              // Otherwise select it
              this.selectWord(mouseupTarget);
            }
          } 
          // Drag selection (even if on same word but mouse moved)
          else {
            // Create a selection between dragStart and endIndex
            const start = Math.min(startIndex, endIndex);
            const end = Math.max(startIndex, endIndex);
            
            // Select the word range
            this.selectWordRange(start, end);
          }
        }
        
        // Reset drag state
        this.isDragging = false;
        this.dragStart = null;
        this.hasMoved = false;
        
        // Clear any temporary highlighting
        const allWordSpans = this.container.querySelectorAll('span[data-type="word"]');
        allWordSpans.forEach(wordSpan => {
          if (!wordSpan.classList.contains('selected')) {
            wordSpan.style.backgroundColor = 'transparent';
          }
        });
      }
    });
    
    interfaceContainer.appendChild(promptSection);
    
    // Create variables section
    const variablesSection = document.createElement('div');
    variablesSection.style.marginBottom = '20px';
    variablesSection.id = 'variablesSection';
    
    // Create a heading with add button
    const headingRow = document.createElement('div');
    headingRow.style.display = 'flex';
    headingRow.style.justifyContent = 'space-between';
    headingRow.style.alignItems = 'center';
    headingRow.style.marginBottom = '10px';
    
    const variablesHeading = document.createElement('h4');
    variablesHeading.textContent = 'Variables';
    variablesHeading.style.margin = '0';
    variablesHeading.style.fontSize = '1.1em';
    variablesHeading.style.color = '#333';
    headingRow.appendChild(variablesHeading);
    
    // Add new variable button
    const addVariableBtn = document.createElement('button');
    addVariableBtn.textContent = '+ Add Variable';
    addVariableBtn.style.padding = '4px 8px';
    addVariableBtn.style.fontSize = '0.9em';
    addVariableBtn.style.background = '#e9eafc';
    addVariableBtn.style.color = '#5e60ce';
    addVariableBtn.style.border = '1px solid #bfc4f6';
    addVariableBtn.style.borderRadius = '6px';
    addVariableBtn.style.cursor = 'pointer';
    addVariableBtn.addEventListener('click', () => this.addNewVariable());
    headingRow.appendChild(addVariableBtn);
    
    variablesSection.appendChild(headingRow);
    
    // Empty state for variables
    const emptyVariables = document.createElement('div');
    emptyVariables.id = 'emptyVariablesMessage';
    emptyVariables.textContent = 'No variables created yet. Select text in the prompt above or click "+ Add Variable" to create variables.';
    emptyVariables.style.fontStyle = 'italic';
    emptyVariables.style.color = '#666';
    emptyVariables.style.padding = '10px 0';
    variablesSection.appendChild(emptyVariables);
    
    // Container for variable rows
    const variableRows = document.createElement('div');
    variableRows.id = 'variableRows';
    variablesSection.appendChild(variableRows);
    
    interfaceContainer.appendChild(variablesSection);
    
    // Create template preview section
    const templateSection = document.createElement('div');
    
    // Create a heading
    const templateHeading = document.createElement('h4');
    templateHeading.textContent = 'Template Preview';
    templateHeading.style.marginTop = '0';
    templateHeading.style.marginBottom = '10px';
    templateHeading.style.fontSize = '1.1em';
    templateHeading.style.color = '#333';
    templateSection.appendChild(templateHeading);
    
    // Template preview section with toggle buttons
    const previewContainer = document.createElement('div');
    previewContainer.style.marginBottom = '15px';
    
    // Preview header with mode toggles
    const previewHeader = document.createElement('div');
    previewHeader.style.display = 'flex';
    previewHeader.style.justifyContent = 'space-between';
    previewHeader.style.alignItems = 'center';
    previewHeader.style.marginBottom = '8px';
    
    // Preview title
    const previewTitle = document.createElement('div');
    previewTitle.textContent = 'Template Preview';
    previewTitle.style.fontWeight = '500';
    previewTitle.style.color = '#333';
    previewHeader.appendChild(previewTitle);
    
    // Toggle buttons container
    const toggleContainer = document.createElement('div');
    toggleContainer.style.display = 'flex';
    toggleContainer.style.gap = '6px';
    toggleContainer.style.alignItems = 'center';
    
    // Template mode (variables with curly braces)
    const templateModeBtn = document.createElement('button');
    templateModeBtn.textContent = 'Template';
    templateModeBtn.style.padding = '4px 8px';
    templateModeBtn.style.fontSize = '0.8em';
    templateModeBtn.style.border = '1px solid #e2e8f0';
    templateModeBtn.style.borderRadius = '4px';
    templateModeBtn.style.background = '#e9eafc';
    templateModeBtn.style.color = '#5e60ce';
    templateModeBtn.style.cursor = 'pointer';
    templateModeBtn.dataset.mode = 'template';
    templateModeBtn.className = 'preview-mode-btn active';
    
    // Sample mode (with actual values)
    const sampleModeBtn = document.createElement('button');
    sampleModeBtn.textContent = 'Example';
    sampleModeBtn.style.padding = '4px 8px';
    sampleModeBtn.style.fontSize = '0.8em';
    sampleModeBtn.style.border = '1px solid #e2e8f0';
    sampleModeBtn.style.borderRadius = '4px';
    sampleModeBtn.style.background = '#fff';
    sampleModeBtn.style.color = '#64748b';
    sampleModeBtn.style.cursor = 'pointer';
    sampleModeBtn.dataset.mode = 'sample';
    sampleModeBtn.className = 'preview-mode-btn';
    
    // Randomize button (only visible in sample mode)
    const randomizeBtn = document.createElement('button');
    randomizeBtn.innerHTML = '&#x1F3B2;'; // Dice emoji
    randomizeBtn.title = 'Randomize values';
    randomizeBtn.style.padding = '4px 8px';
    randomizeBtn.style.fontSize = '0.8em';
    randomizeBtn.style.border = '1px solid #e2e8f0';
    randomizeBtn.style.borderRadius = '4px';
    randomizeBtn.style.background = '#fff';
    randomizeBtn.style.color = '#64748b';
    randomizeBtn.style.cursor = 'pointer';
    randomizeBtn.style.display = 'none'; // Initially hidden
    
    // Add toggle functionality
    [templateModeBtn, sampleModeBtn].forEach(btn => {
      btn.addEventListener('click', () => {
        // Update button styles
        templateModeBtn.style.background = btn === templateModeBtn ? '#e9eafc' : '#fff';
        templateModeBtn.style.color = btn === templateModeBtn ? '#5e60ce' : '#64748b';
        sampleModeBtn.style.background = btn === sampleModeBtn ? '#e9eafc' : '#fff';
        sampleModeBtn.style.color = btn === sampleModeBtn ? '#5e60ce' : '#64748b';
        
        // Show/hide randomize button
        randomizeBtn.style.display = btn === sampleModeBtn ? 'block' : 'none';
        
        // Update the preview content
        this.previewMode = btn.dataset.mode;
        this.updateTemplatePreview();
      });
    });
    
    // Randomize button functionality
    randomizeBtn.addEventListener('click', () => {
      this.updateTemplatePreview(true); // true means force regenerate random values
    });
    
    toggleContainer.appendChild(templateModeBtn);
    toggleContainer.appendChild(sampleModeBtn);
    toggleContainer.appendChild(randomizeBtn);
    previewHeader.appendChild(toggleContainer);
    
    previewContainer.appendChild(previewHeader);
    
    // Template preview content
    this.templatePreview = document.createElement('div');
    this.templatePreview.style.padding = '15px';
    this.templatePreview.style.backgroundColor = '#f9f9f9';
    this.templatePreview.style.border = '1px solid #eee';
    this.templatePreview.style.borderRadius = '6px';
    this.templatePreview.style.fontFamily = 'monospace';
    this.templatePreview.style.whiteSpace = 'pre-wrap';
    this.templatePreview.style.lineHeight = '1.5';
    this.templatePreview.style.color = '#334155';
    this.templatePreview.style.minHeight = '60px';
    previewContainer.appendChild(this.templatePreview);
    
    // Initialize preview mode
    this.previewMode = 'template';
    
    templateSection.appendChild(previewContainer);
    
    // We'll use the existing template name field in the HTML, not create a duplicate one here
    
    // Buttons section
    const buttonsSection = document.createElement('div');
    buttonsSection.style.display = 'flex';
    buttonsSection.style.gap = '10px';
    buttonsSection.style.marginTop = '15px';
    
    // Download button
    const downloadBtn = document.createElement('button');
    downloadBtn.innerHTML = '<span style="margin-right:5px;">⬇️</span> Download JSON';
    downloadBtn.style.flex = '1';
    downloadBtn.style.padding = '8px 15px';
    downloadBtn.style.background = '#4f46e5';
    downloadBtn.style.color = 'white';
    downloadBtn.style.border = 'none';
    downloadBtn.style.borderRadius = '6px';
    downloadBtn.style.cursor = 'pointer';
    downloadBtn.style.fontWeight = '500';
    downloadBtn.addEventListener('click', () => {
      // Get template name from the HTML field
      const templateNameField = document.getElementById('templateName');
      const templateName = templateNameField ? templateNameField.value : '';
      
      // Generate Synthograsizer-compatible template JSON
      const templateData = this.generateSynthograsizerTemplate(templateName);
      
      // Create downloadable JSON file
      const jsonString = JSON.stringify(templateData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      const filename = (templateName || 'SynthograsizerTemplate').toLowerCase().replace(/\s+/g, '-') + '.json';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    buttonsSection.appendChild(downloadBtn);
    
    // Save & open button
    const saveBtn = document.createElement('button');
    saveBtn.innerHTML = '<span style="margin-right:5px;">➡️</span> Save & Open';
    saveBtn.style.flex = '1';
    saveBtn.style.padding = '8px 15px';
    saveBtn.style.background = '#10b981';
    saveBtn.style.color = 'white';
    saveBtn.style.border = 'none';
    saveBtn.style.borderRadius = '6px';
    saveBtn.style.cursor = 'pointer';
    saveBtn.style.fontWeight = '500';
    saveBtn.addEventListener('click', () => {
      // Get template name from the HTML field
      const templateNameField = document.getElementById('templateName');
      const templateName = templateNameField ? templateNameField.value : '';
      
      // Generate Synthograsizer-compatible template
      const templateData = this.generateSynthograsizerTemplate(templateName);
      
      // Save to localStorage for Synthograsizer
      localStorage.setItem('synthTemplate', JSON.stringify(templateData));
      
      // Redirect to Synthograsizer
      window.location.href = '../index.html?template=true';
    });
    buttonsSection.appendChild(saveBtn);
    
    templateSection.appendChild(buttonsSection);
    
    interfaceContainer.appendChild(templateSection);
    this.container.appendChild(interfaceContainer);
    
    // Initial update of template preview
    this.updateTemplatePreview();
  }
  
  /**
   * Remove a variable by deselecting its word(s)
   * @param {HTMLElement} wordElement - The word element to deselect
   */
  deselectWord(wordElement) {
    // Only process word elements
    if (wordElement.dataset.type !== 'word') return;
    
    const index = parseInt(wordElement.dataset.index);
    
    // Find which selection this word belongs to
    const existingSelectionIndex = this.selections.findIndex(sel => 
      index >= sel.start && index <= sel.end
    );
    
    if (existingSelectionIndex >= 0) {
      // Get the selection to remove
      const selection = this.selections[existingSelectionIndex];
      
      // Clear styling for all spans in this selection
      for (let i = selection.start; i <= selection.end; i++) {
        const span = this.container.querySelector(`span[data-index="${i}"]`);
        if (span) {
          span.style.backgroundColor = 'transparent';
          span.style.color = '';
          span.style.fontWeight = '';
          span.style.padding = '1px';
          span.classList.remove('selected');
        }
      }
      
      // Remove from selections and variables
      this.selections.splice(existingSelectionIndex, 1);
      this.variables.splice(existingSelectionIndex, 1);
      
      // Update UI
      this.updateVariablesList();
      this.updateTemplatePreview();
    }
  }
  
  /**
   * Handle selection of a word
   * @param {HTMLElement} wordElement - The word element
   */
  selectWord(wordElement) {
    // Only process word elements (not spaces)
    if (wordElement.dataset.type !== 'word') return;
    
    const index = parseInt(wordElement.dataset.index);
    
    // Check if already part of a selection
    const existingSelectionIndex = this.selections.findIndex(sel => 
      index >= sel.start && index <= sel.end
    );
    
    if (existingSelectionIndex >= 0) {
      // If it's already selected, deselect it
      this.deselectWord(wordElement);
    } else {
      // Create a new selection for just this word
      const selection = {
        start: index,
        end: index
      };
      
      // Get the word text
      const wordText = wordElement.textContent;
      
      // Create a variable name from the word
      let varName = wordText.toLowerCase()
        .replace(/[^a-z0-9]/g, '_')  // Replace non-alphanumeric chars with underscore
        .replace(/^_+|_+$/g, '')     // Remove leading/trailing underscores
        .replace(/_+/g, '_');        // Replace multiple underscores with single
      
      // Ensure it's not empty
      if (!varName) varName = 'var';
      
      // Ensure unique name
      let uniqueVarName = varName;
      let counter = 1;
      while (this.variables.some(v => v.name === uniqueVarName)) {
        uniqueVarName = `${varName}_${counter}`;
        counter++;
      }
      
      // Create the variable
      const variable = {
        name: uniqueVarName,
        display_name: this.capitalizeWords(wordText),
        value: wordText
      };
      
      this.selections.push(selection);
      this.variables.push(variable);
      
      // Style the selected word
      wordElement.style.backgroundColor = this.getColorForIndex(this.selections.length - 1);
      wordElement.style.color = '#fff';
      wordElement.style.fontWeight = '500';
      wordElement.style.padding = '2px 4px';
      wordElement.classList.add('selected');
    }
    
    // Update the UI
    this.updateVariablesList();
    this.updateTemplatePreview();
  }
  
  /**
   * Handle selection of a range of words
   * @param {number} startIndex - The start index of the range
   * @param {number} endIndex - The end index of the range
   */
  selectWordRange(startIndex, endIndex) {
    // Check if any of the words in the range are already part of a selection
    for (let i = startIndex; i <= endIndex; i++) {
      const existingSelectionIndex = this.selections.findIndex(sel => 
        i >= sel.start && i <= sel.end
      );
      
      if (existingSelectionIndex >= 0) {
        // We can't create overlapping selections, so we'll remove the existing one first
        const selection = this.selections[existingSelectionIndex];
        
        // Clear styling for all spans in this selection
        for (let j = selection.start; j <= selection.end; j++) {
          const span = this.container.querySelector(`span[data-index="${j}"]`);
          if (span) {
            span.style.backgroundColor = 'transparent';
            span.style.color = 'inherit';
            span.style.fontWeight = 'normal';
            span.style.padding = '1px';
            span.classList.remove('selected');
          }
        }
        
        this.selections.splice(existingSelectionIndex, 1);
        this.variables.splice(existingSelectionIndex, 1);
      }
    }
    
    // Create a new selection for the range
    const selection = {
      start: startIndex,
      end: endIndex
    };
    
    // Collect all the words in the range to create a combined variable
    let combinedText = '';
    for (let i = startIndex; i <= endIndex; i++) {
      const span = this.container.querySelector(`span[data-index="${i}"]`);
      if (span) {
        combinedText += span.textContent;
      }
    }
    
    // Create a variable name from the combined text
    let varName = combinedText.toLowerCase()
      .replace(/[^a-z0-9]/g, '_')  // Replace non-alphanumeric chars with underscore
      .replace(/^_+|_+$/g, '')     // Remove leading/trailing underscores
      .replace(/_+/g, '_');        // Replace multiple underscores with single
      
    // Truncate if too long
    if (varName.length > 20) {
      varName = varName.substring(0, 20);
    }
    
    // Ensure it's not empty
    if (!varName) varName = 'var';
    
    // Ensure unique name
    let uniqueVarName = varName;
    let counter = 1;
    while (this.variables.some(v => v.name === uniqueVarName)) {
      uniqueVarName = `${varName}_${counter}`;
      counter++;
    }
    
    // Create the variable
    const variable = {
      name: uniqueVarName,
      display_name: this.capitalizeWords(combinedText),
      value: combinedText
    };
    
    this.selections.push(selection);
    this.variables.push(variable);
    
    // Style all the words in the selection
    const colorIndex = this.selections.length - 1;
    const backgroundColor = this.getColorForIndex(colorIndex);
    
    for (let i = startIndex; i <= endIndex; i++) {
      const span = this.container.querySelector(`span[data-index="${i}"]`);
      if (span) {
        span.style.backgroundColor = backgroundColor;
        span.style.color = '#fff';
        span.style.fontWeight = '500';
        span.style.padding = '2px 4px';
        span.classList.add('selected');
      }
    }
    
    // Update the UI
    this.updateVariablesList();
    this.updateTemplatePreview();
  }
  
  /**
   * Update the variables list in the UI
   */
  updateVariablesList() {
    const variableRows = this.container.querySelector('#variableRows');
    const emptyMessage = this.container.querySelector('#emptyVariablesMessage');
    
    // Also find the main variables container in the HTML template
    const htmlVariablesContainer = document.getElementById('variablesContainer');
    
    // Show/hide empty message and variables container
    if (this.variables.length === 0) {
      if (emptyMessage) emptyMessage.style.display = 'block';
      if (variableRows) variableRows.innerHTML = '';
      if (htmlVariablesContainer) htmlVariablesContainer.style.display = 'none';
      return;
    } else {
      if (emptyMessage) emptyMessage.style.display = 'none';
      if (htmlVariablesContainer) htmlVariablesContainer.style.display = 'block';
    }
    
    // Clear and rebuild
    variableRows.innerHTML = '';
    
    // Create rows for each variable
    this.variables.forEach((variable, index) => {
      // Create the main accordion container for this variable
      const accordionContainer = document.createElement('div');
      accordionContainer.className = 'variable-accordion';
      accordionContainer.style.marginBottom = '10px';
      accordionContainer.style.border = '1px solid #e2e8f0';
      accordionContainer.style.borderRadius = '6px';
      accordionContainer.style.overflow = 'hidden';
      
      // Create the accordion header (always visible)
      const accordionHeader = document.createElement('div');
      accordionHeader.className = 'accordion-header';
      accordionHeader.style.padding = '10px 12px';
      accordionHeader.style.background = '#f8fafc';
      accordionHeader.style.borderBottom = '1px solid #e2e8f0';
      accordionHeader.style.display = 'flex';
      accordionHeader.style.alignItems = 'center';
      accordionHeader.style.justifyContent = 'space-between';
      accordionHeader.style.cursor = 'pointer';
      
      // Left side of header with color indicator and name
      const headerLeft = document.createElement('div');
      headerLeft.style.display = 'flex';
      headerLeft.style.alignItems = 'center';
      headerLeft.style.gap = '8px';
      headerLeft.style.flex = '1';
      
      // Color indicator
      const colorIndicator = document.createElement('div');
      colorIndicator.style.width = '12px';
      colorIndicator.style.height = '12px';
      colorIndicator.style.borderRadius = '3px';
      colorIndicator.style.backgroundColor = this.getColorForIndex(index);
      headerLeft.appendChild(colorIndicator);
      
      // Variable name display
      const variableName = document.createElement('div');
      variableName.textContent = `{{${variable.name}}}`;
      variableName.style.fontWeight = '500';
      variableName.style.color = '#333';
      headerLeft.appendChild(variableName);
      
      // Value preview
      const valuePreview = document.createElement('div');
      valuePreview.textContent = variable.value;
      valuePreview.style.color = '#64748b';
      valuePreview.style.fontSize = '0.9em';
      valuePreview.style.marginLeft = '8px';
      valuePreview.style.overflow = 'hidden';
      valuePreview.style.textOverflow = 'ellipsis';
      valuePreview.style.whiteSpace = 'nowrap';
      valuePreview.style.maxWidth = '150px';
      headerLeft.appendChild(valuePreview);
      
      accordionHeader.appendChild(headerLeft);
      
      // Expand/collapse and delete actions
      const headerActions = document.createElement('div');
      headerActions.style.display = 'flex';
      headerActions.style.alignItems = 'center';
      headerActions.style.gap = '8px';
      
      // Toggle button
      const toggleBtn = document.createElement('button');
      toggleBtn.innerHTML = '&#9650;'; // Up arrow
      toggleBtn.title = 'Expand/Collapse';
      toggleBtn.style.background = 'none';
      toggleBtn.style.border = 'none';
      toggleBtn.style.color = '#64748b';
      toggleBtn.style.fontSize = '0.8em';
      toggleBtn.style.cursor = 'pointer';
      toggleBtn.style.padding = '4px';
      toggleBtn.style.transition = 'transform 0.2s';
      toggleBtn.className = 'accordion-toggle';
      headerActions.appendChild(toggleBtn);
      
      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = '&times;';
      deleteBtn.title = 'Remove variable';
      deleteBtn.style.background = 'none';
      deleteBtn.style.border = 'none';
      deleteBtn.style.color = '#64748b';
      deleteBtn.style.fontSize = '1.2em';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.padding = '4px';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent opening/closing when clicking delete
        
        // Remove this variable and selection
        if (index < this.selections.length) {
          const selection = this.selections[index];
          
          // Clear styling for all spans in this selection
          for (let i = selection.start; i <= selection.end; i++) {
            const span = this.container.querySelector(`span[data-index="${i}"]`);
            if (span) {
              span.style.backgroundColor = 'transparent';
              span.style.color = 'inherit';
              span.style.fontWeight = 'normal';
              span.style.padding = '1px';
              span.classList.remove('selected');
            }
          }
          
          this.selections.splice(index, 1);
        }
        
        this.variables.splice(index, 1);
        
        // Update the UI
        this.updateVariablesList();
        this.updateTemplatePreview();
      });
      headerActions.appendChild(deleteBtn);
      
      accordionHeader.appendChild(headerActions);
      accordionContainer.appendChild(accordionHeader);
      
      // Create the content container (collapsible)
      const contentContainer = document.createElement('div');
      contentContainer.className = 'accordion-content';
      contentContainer.style.padding = '12px';
      contentContainer.style.background = 'white';
      
      // Form fields
      const fields = document.createElement('div');
      
      // Variable name field (used in template)
      const nameGroup = document.createElement('div');
      nameGroup.style.marginBottom = '12px';
      
      const nameLabel = document.createElement('label');
      nameLabel.textContent = 'Variable Name (in template):';
      nameLabel.style.display = 'block';
      nameLabel.style.fontSize = '0.85em';
      nameLabel.style.marginBottom = '3px';
      nameLabel.style.color = '#64748b';
      nameGroup.appendChild(nameLabel);
      
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = variable.name;
      nameInput.style.padding = '6px 8px';
      nameInput.style.width = '100%';
      nameInput.style.border = '1px solid #e2e8f0';
      nameInput.style.borderRadius = '4px';
      nameInput.style.fontSize = '0.9em';
      nameInput.dataset.index = index;
      nameInput.dataset.field = 'name';
      nameInput.addEventListener('input', (e) => {
        // Update variable name, ensuring it's valid for template
        let value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        e.target.value = value;
        this.variables[index].name = value;
        
        // Update the header display
        variableName.textContent = `{{${value}}}`;
        
        this.updateTemplatePreview();
      });
      nameGroup.appendChild(nameInput);
      fields.appendChild(nameGroup);
      
      // Display name field (shown in UI)
      const displayGroup = document.createElement('div');
      displayGroup.style.marginBottom = '12px';
      
      const displayLabel = document.createElement('label');
      displayLabel.textContent = 'Display Name (UI label):';
      displayLabel.style.display = 'block';
      displayLabel.style.fontSize = '0.85em';
      displayLabel.style.marginBottom = '3px';
      displayLabel.style.color = '#64748b';
      displayGroup.appendChild(displayLabel);
      
      const displayInput = document.createElement('input');
      displayInput.type = 'text';
      displayInput.value = variable.display_name;
      displayInput.style.padding = '6px 8px';
      displayInput.style.width = '100%';
      displayInput.style.border = '1px solid #e2e8f0';
      displayInput.style.borderRadius = '4px';
      displayInput.style.fontSize = '0.9em';
      displayInput.dataset.index = index;
      displayInput.dataset.field = 'display_name';
      displayInput.addEventListener('input', (e) => {
        this.variables[index].display_name = e.target.value;
      });
      displayGroup.appendChild(displayInput);
      fields.appendChild(displayGroup);
      
      // Current value field (editable)
      const valueGroup = document.createElement('div');
      valueGroup.style.marginBottom = '12px';
      
      const valueLabel = document.createElement('label');
      valueLabel.textContent = 'Default Value:';
      valueLabel.style.display = 'block';
      valueLabel.style.fontSize = '0.85em';
      valueLabel.style.marginBottom = '3px';
      valueLabel.style.color = '#64748b';
      valueGroup.appendChild(valueLabel);
      
      const valueInput = document.createElement('input');
      valueInput.type = 'text';
      valueInput.value = variable.value;
      valueInput.style.padding = '6px 8px';
      valueInput.style.width = '100%';
      valueInput.style.border = '1px solid #e2e8f0';
      valueInput.style.borderRadius = '4px';
      valueInput.style.fontSize = '0.9em';
      valueInput.dataset.index = index;
      valueInput.dataset.field = 'value';
      valueInput.addEventListener('input', (e) => {
        this.variables[index].value = e.target.value;
        
        // Update the preview in the header
        valuePreview.textContent = e.target.value;
      });
      valueGroup.appendChild(valueInput);
      fields.appendChild(valueGroup);
      
      // Alternative values section
      const altValuesGroup = document.createElement('div');
      
      const altValuesLabel = document.createElement('div');
      altValuesLabel.innerHTML = '<span>Alternative Values:</span> <span style="font-size:0.8em;color:#64748b;">(one per line)</span>';
      altValuesLabel.style.display = 'flex';
      altValuesLabel.style.alignItems = 'center';
      altValuesLabel.style.gap = '6px';
      altValuesLabel.style.fontSize = '0.85em';
      altValuesLabel.style.marginBottom = '3px';
      altValuesLabel.style.color = '#64748b';
      altValuesGroup.appendChild(altValuesLabel);
      
      // Create a textarea for alternative values
      const altValuesInput = document.createElement('textarea');
      
      // If we have existing values, use those
      if (variable.alt_values && Array.isArray(variable.alt_values)) {
        altValuesInput.value = variable.alt_values.join('\n');
      } else {
        // Generate some default alternatives
        const similarValues = this.generateSimilarValues(variable.value, 3);
        variable.alt_values = similarValues;
        altValuesInput.value = similarValues.join('\n');
      }
      
      altValuesInput.style.padding = '6px 8px';
      altValuesInput.style.width = '100%';
      altValuesInput.style.minHeight = '80px';
      altValuesInput.style.border = '1px solid #e2e8f0';
      altValuesInput.style.borderRadius = '4px';
      altValuesInput.style.fontSize = '0.9em';
      altValuesInput.style.resize = 'vertical';
      altValuesInput.dataset.index = index;
      altValuesInput.addEventListener('input', (e) => {
        // Update alternative values when textarea changes
        const values = e.target.value
          .split('\n')
          .map(v => v.trim())
          .filter(v => v.length > 0);
        this.variables[index].alt_values = values;
      });
      altValuesGroup.appendChild(altValuesInput);
      fields.appendChild(altValuesGroup);
      
      contentContainer.appendChild(fields);
      accordionContainer.appendChild(contentContainer);
      
      // Add accordion functionality
      accordionHeader.addEventListener('click', () => {
        // Toggle content visibility
        if (contentContainer.style.display === 'none') {
          contentContainer.style.display = 'block';
          toggleBtn.innerHTML = '&#9650;'; // Up arrow
          toggleBtn.style.transform = 'rotate(0deg)';
        } else {
          contentContainer.style.display = 'none';
          toggleBtn.innerHTML = '&#9660;'; // Down arrow
          toggleBtn.style.transform = 'rotate(0deg)';
        }
      });
      
      // Start with content expanded
      contentContainer.style.display = 'block';
      
      variableRows.appendChild(accordionContainer);
    });
  }
  
  /**
   * Update the template preview
   * @param {boolean} forceRandomize - If true, forces regeneration of random values
   */
  updateTemplatePreview(forceRandomize = false) {
    if (this.previewMode === 'template' || this.variables.length === 0) {
      // Template mode - show with variable placeholders
      const template = this.generateTemplate();
      this.templatePreview.textContent = template;
    } else {
      // Example mode - replace variables with actual or random values
      // First, get the template with placeholders
      const template = this.generateTemplate();
      
      // Store the last used random values if we don't want to regenerate them
      if (!this.randomValues || forceRandomize) {
        this.randomValues = {};
      }
      
      // Replace each variable with a sample value
      let exampleText = template;
      
      this.variables.forEach(variable => {
        const placeholder = `{{${variable.name}}}`;
        
        // Pick a value for this variable
        let value;
        
        // If we have stored random values and don't need to regenerate, use the stored value
        if (this.randomValues[variable.name] && !forceRandomize) {
          value = this.randomValues[variable.name];
        } else {
          // Compile a list of possible values for this variable
          const possibleValues = [variable.value]; // Start with the default value
          
          // Add alternative values if they exist
          if (variable.alt_values && Array.isArray(variable.alt_values) && variable.alt_values.length > 0) {
            possibleValues.push(...variable.alt_values);
          }
          
          // Pick a random value from the possible values
          const randomIndex = Math.floor(Math.random() * possibleValues.length);
          value = possibleValues[randomIndex];
          
          // Store this value for future use
          this.randomValues[variable.name] = value;
        }
        
        // Replace all occurrences of the placeholder with the value
        exampleText = exampleText.replace(new RegExp(placeholder, 'g'), value);
      });
      
      this.templatePreview.textContent = exampleText;
    }
  }
  
  /**
   * Helper to capitalize the first letter of each word
   * @param {string} str - The string to capitalize
   * @returns {string} The capitalized string
   */
  capitalizeWords(str) {
    return str.replace(/\\b\\w/g, l => l.toUpperCase());
  }
  
  /**
   * Get a color for a variable based on its index
   * @param {number} index - The variable index
   * @returns {string} The color
   */
  getColorForIndex(index) {
    const colors = [
      '#93c5fd', // blue-300
      '#86efac', // green-300
      '#fda4af', // rose-300
      '#c4b5fd', // violet-300
      '#fdba74', // orange-300
      '#a5f3fc', // cyan-300
      '#fbcfe8', // pink-300
      '#d9f99d', // lime-300
    ];
    return colors[index % colors.length];
  }
  
  /**
   * Generates the template with variable placeholders
   * @returns {string} The template string
   */
  generateTemplate() {
    if (this.variables.length === 0) {
      return this.originalPrompt;
    }
    
    // Sort selections by start index in reverse order
    // This ensures we replace from right to left so indices don't shift
    const sortedSelections = [...this.selections].sort((a, b) => b.start - a.start);
    
    // Create a copy of the original prompt to modify
    let template = this.originalPrompt;
    
    // First, let's compute the character positions for each word in the original prompt
    // This will help us place variables correctly
    const regex = /(\S+)(\s*)/g;
    let match;
    let wordPositions = [];
    let lastIndex = 0;
    
    while ((match = regex.exec(this.originalPrompt)) !== null) {
      wordPositions.push({
        text: match[1], // The word
        start: match.index,
        end: match.index + match[0].length - 1
      });
      lastIndex = match.index + match[0].length;
    }
    
    // Now replace each selection with its variable placeholder
    sortedSelections.forEach((selection) => {
      const variable = this.variables[this.selections.indexOf(selection)];
      const placeholder = `{{${variable.name}}}`;
      
      // Find the character position in the original text
      // We need to find the word that corresponds to our selection index
      const wordPosition = wordPositions[Math.floor(selection.start / 2)]; // Divide by 2 because we have words and spaces
      
      if (wordPosition) {
        // Find the original text being replaced
        const originalText = wordPosition.text;
        
        // Replace at the correct position
        // Since we're working from right to left, the positions in the template are still valid
        template = template.substring(0, wordPosition.start) + 
                  placeholder + 
                  template.substring(wordPosition.start + originalText.length);
      }
    });
    
    return template;
  }
  
  /**
   * Add a new blank variable
   */
  addNewVariable() {
    const varCounter = this.variables.length + 1;
    const varName = `variable_${varCounter}`;
    
    // Create the variable with alternative values
    const variable = {
      name: varName,
      display_name: `Variable ${varCounter}`,
      value: `[value${varCounter}]`,
      alt_values: [
        `[option${varCounter}_1]`,
        `[option${varCounter}_2]`,
        `[option${varCounter}_3]`
      ]
    };
    
    this.variables.push(variable);
    
    // Update the UI
    this.updateVariablesList();
    this.updateTemplatePreview();
  }

  /**
   * Generates a Synthograsizer-compatible template JSON object
   * @param {string} title - The title for the template
   * @returns {Object} A JSON object compatible with Synthograsizer project templates
   */
  generateSynthograsizerTemplate(title) {
    // Generate the template string with variable placeholders
    const promptTemplate = this.generateTemplate();
    
    // Create the formatted variables array for Synthograsizer
    const formattedVariables = this.variables.map(variable => {
      // Create a sample set of values for each variable
      // We'll use the current value as the first option
      const sampleValues = [variable.value];
      
      // Add user-defined alternative values if they exist
      if (variable.alt_values && Array.isArray(variable.alt_values)) {
        sampleValues.push(...variable.alt_values);
      }
      
      return {
        "name": variable.name,
        "feature_name": variable.name,
        "values": sampleValues
      };
    });
    
    // Create the final template object matching Synthograsizer format exactly
    return {
      "promptTemplate": promptTemplate,
      "variables": formattedVariables
    };
  }
  
  /**
   * Generate similar placeholder values for a variable
   * This is a simple implementation - in a production version
   * this could use AI APIs or more sophisticated methods
   * @param {string} originalValue - The original value to generate alternatives for
   * @param {number} count - Number of alternatives to generate
   * @returns {Array} Array of alternative values
   */
  generateSimilarValues(originalValue, count) {
    // These are just placeholder lists to demonstrate the concept
    // In a real implementation, these could be more sophisticated
    const adjectives = ["vibrant", "mysterious", "ancient", "futuristic", "elegant", "rustic", "glowing", "ethereal"];
    const subjects = ["character", "creature", "landscape", "cityscape", "portrait", "still life", "concept art"];
    const styles = ["digital painting", "watercolor", "oil painting", "sketch", "3D render", "photorealistic", "anime"];
    const colors = ["red", "blue", "green", "purple", "teal", "golden", "silver", "copper"];
    const materials = ["metal", "wood", "glass", "crystal", "fabric", "stone", "leather"];
    
    // Determine what kind of value this might be
    let valueType = "generic";
    if (originalValue.toLowerCase().match(/red|blue|green|yellow|purple|pink|orange|black|white|gray|brown/)) {
      valueType = "color";
    } else if (originalValue.toLowerCase().match(/hair|eyes|face|arm|leg|tail|wing/)) {
      valueType = "bodyPart";
    } else if (originalValue.toLowerCase().match(/shirt|pants|dress|coat|jacket|hat|crown|helmet/)) {
      valueType = "clothing";
    }
    
    // Generate alternatives based on the value type
    const alternatives = [];
    for (let i = 0; i < count; i++) {
      let alternative;
      
      switch (valueType) {
        case "color":
          alternative = colors[Math.floor(Math.random() * colors.length)];
          break;
        case "bodyPart":
          alternative = adjectives[Math.floor(Math.random() * adjectives.length)] + " " + 
                      originalValue.split(" ").pop(); // Keep the body part, change the adjective
          break;
        case "clothing":
          alternative = colors[Math.floor(Math.random() * colors.length)] + " " + 
                      originalValue.split(" ").pop(); // Keep the clothing item, change the color
          break;
        default:
          // For unknown types, create a generic alternative
          alternative = adjectives[Math.floor(Math.random() * adjectives.length)] + " " + 
                      subjects[Math.floor(Math.random() * subjects.length)];
      }
      
      // Make sure we don't duplicate the original value
      if (alternative !== originalValue && !alternatives.includes(alternative)) {
        alternatives.push(alternative);
      } else {
        // If we got a duplicate, try again with a fallback
        const fallback = styles[Math.floor(Math.random() * styles.length)] + " of " + 
                        materials[Math.floor(Math.random() * materials.length)];
        if (!alternatives.includes(fallback)) {
          alternatives.push(fallback);
        }
      }
    }
    
    return alternatives;
  }
}

// Export the PromptTemplater class
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = { PromptTemplater };
} else {
  // Browser context
  window.PromptTemplater = PromptTemplater;
}
