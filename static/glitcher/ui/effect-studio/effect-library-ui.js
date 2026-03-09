/**
 * Effect Library UI Component
 * Displays available effects organized by category
 * Allows searching and adding effects to the chain
 */

export class EffectLibraryUI {
    constructor(container, effectFactory, onAddEffect) {
        this.container = container;
        this.effectFactory = effectFactory;
        this.onAddEffect = onAddEffect;
        this.searchTerm = '';
        this.expandedCategories = new Set(['Movement', 'Distort', 'Color', 'Filters']); // Default expanded
        
        this.initialize();
    }

    initialize() {
        this.render();
        this.attachEventListeners();
    }

    render() {
        const effects = this.getFilteredEffects();
        const categories = this.organizeByCategory(effects);
        
        this.container.innerHTML = `
            <div class="effect-library">
                <div class="library-header">
                    <h3>Effects Library</h3>
                    <div class="search-container">
                        <input type="search" 
                               class="effect-search" 
                               placeholder="Search effects..." 
                               value="${this.searchTerm}">
                        <span class="search-icon">🔍</span>
                    </div>
                </div>
                <div class="library-content">
                    ${this.renderCategories(categories)}
                </div>
                <div class="library-footer">
                    <div class="library-info">
                        ${effects.length} effects available
                    </div>
                </div>
            </div>
        `;
    }

    getFilteredEffects() {
        const allEffects = this.effectFactory.getAvailableEffects();
        
        if (!this.searchTerm) {
            return allEffects;
        }
        
        const searchLower = this.searchTerm.toLowerCase();
        return allEffects.filter(effect => 
            effect.name.toLowerCase().includes(searchLower) ||
            effect.category.toLowerCase().includes(searchLower) ||
            (effect.description && effect.description.toLowerCase().includes(searchLower))
        );
    }

    organizeByCategory(effects) {
        const categories = new Map();
        
        effects.forEach(effect => {
            if (!categories.has(effect.category)) {
                categories.set(effect.category, []);
            }
            categories.get(effect.category).push(effect);
        });
        
        // Sort categories and effects within each category
        const sortedCategories = new Map([...categories.entries()].sort());
        sortedCategories.forEach((effects, category) => {
            effects.sort((a, b) => a.name.localeCompare(b.name));
        });
        
        return sortedCategories;
    }

    renderCategories(categories) {
        if (categories.size === 0) {
            return `
                <div class="no-results">
                    <div class="no-results-icon">🔍</div>
                    <div class="no-results-text">No effects found</div>
                    <div class="no-results-hint">Try a different search term</div>
                </div>
            `;
        }
        
        let html = '';
        
        categories.forEach((effects, category) => {
            const isExpanded = this.expandedCategories.has(category);
            const categoryIcon = this.getCategoryIcon(category);
            
            html += `
                <div class="category-section" data-category="${category}">
                    <div class="category-header ${isExpanded ? 'expanded' : ''}" data-category="${category}">
                        <span class="category-icon">${categoryIcon}</span>
                        <span class="category-name">${category}</span>
                        <span class="category-count">${effects.length}</span>
                        <span class="category-toggle">${isExpanded ? '▼' : '▶'}</span>
                    </div>
                    <div class="category-effects ${isExpanded ? 'expanded' : 'collapsed'}">
                        ${this.renderEffects(effects)}
                    </div>
                </div>
            `;
        });
        
        return html;
    }
    
    renderEffects(effects) {
        return effects.map(effect => `
            <div class="library-effect" 
                 data-effect-type="${effect.id}"
                 data-tooltip="${effect.description || effect.name}"
                 data-tooltip-position="right">
                <div class="effect-content">
                    <span class="effect-icon">${effect.icon || '◆'}</span>
                    <span class="effect-name">${effect.name}</span>
                    <span class="effect-category">${effect.category || 'General'}</span>
                </div>
                <button class="add-to-chain" 
                        data-effect-type="${effect.id}"
                        data-tooltip="Add ${effect.name} to effects chain"
                        data-tooltip-position="left">
                    <span class="add-icon">+</span>
                </button>
            </div>
        `).join('');
    }
    getCategoryIcon(category) {
        const icons = {
            'Movement': '➡️',
            'Distort': '🌀',
            'Color': '🎨',
            'Filters': '🎭',
            'Experimental': '🔬',
            'Custom': '⚡'
        };
        return icons[category] || '📦';
    }

    attachEventListeners() {
        // Search functionality
        this.container.addEventListener('input', (e) => {
            if (e.target.matches('.effect-search')) {
                this.searchTerm = e.target.value;
                this.render();
            }
        });

        // Category expand/collapse
        this.container.addEventListener('click', (e) => {
            const categoryHeader = e.target.closest('.category-header');
            if (categoryHeader) {
                const category = categoryHeader.dataset.category;
                this.toggleCategory(category);
            }
        });

        // Add effect to chain
        this.container.addEventListener('click', (e) => {
            const addButton = e.target.closest('.add-to-chain');
            if (addButton) {
                const effectType = addButton.dataset.effectType;
                this.addEffect(effectType);
            }
        });

        // Double-click to add
        this.container.addEventListener('dblclick', (e) => {
            const effectElement = e.target.closest('.library-effect');
            if (effectElement) {
                const effectType = effectElement.dataset.effectType;
                this.addEffect(effectType);
            }
        });

        // Keyboard navigation
        this.container.addEventListener('keydown', (e) => {
            if (e.target.matches('.effect-search')) {
                if (e.key === 'Escape') {
                    e.target.value = '';
                    this.searchTerm = '';
                    this.render();
                }
            }
        });
    }

    toggleCategory(category) {
        if (this.expandedCategories.has(category)) {
            this.expandedCategories.delete(category);
        } else {
            this.expandedCategories.add(category);
        }
        
        // Re-render to ensure state is properly reflected
        this.render();
    }

    addEffect(effectType) {
        try {
            const effectModule = this.effectFactory.createEffect(effectType);
            if (effectModule && this.onAddEffect) {
                this.onAddEffect(effectModule);
                
                // Visual feedback
                this.showAddedFeedback(effectType);
            }
        } catch (error) {
            console.error('Error adding effect:', error);
            this.showErrorFeedback(error.message);
        }
    }

    showAddedFeedback(effectType) {
        const effectElement = this.container.querySelector(`[data-effect-type="${effectType}"]`);
        if (effectElement) {
            effectElement.classList.add('just-added');
            setTimeout(() => {
                effectElement.classList.remove('just-added');
            }, 600);
        }
    }

    showErrorFeedback(message) {
        // Could show a toast notification here
        console.error('Effect Library Error:', message);
    }

    // Public methods
    expandAll() {
        const categories = this.organizeByCategory(this.getFilteredEffects());
        categories.forEach((_, category) => {
            this.expandedCategories.add(category);
        });
        this.render();
    }

    collapseAll() {
        this.expandedCategories.clear();
        this.render();
    }

    resetSearch() {
        this.searchTerm = '';
        const searchInput = this.container.querySelector('.effect-search');
        if (searchInput) {
            searchInput.value = '';
        }
        this.render();
    }

    // Get current state for persistence
    getState() {
        return {
            searchTerm: this.searchTerm,
            expandedCategories: Array.from(this.expandedCategories)
        };
    }

    // Restore from saved state
    setState(state) {
        if (state.searchTerm !== undefined) {
            this.searchTerm = state.searchTerm;
        }
        if (state.expandedCategories) {
            this.expandedCategories = new Set(state.expandedCategories);
        }
        this.render();
    }

    // Refresh/update the library UI (alias for render)
    refresh() {
        this.render();
    }
}
