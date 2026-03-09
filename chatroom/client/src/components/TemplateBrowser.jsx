import React, { useState, useMemo } from 'react';
import {
  templateCategories,
  agentTemplates,
  sessionTemplates,
  listTemplatesByCategory,
  listSessionTemplatesByCategory,
  searchTemplates,
  getTemplate,
  getSessionTemplate
} from '../utils/agentTemplates';

export function TemplateBrowser({ isOpen, onClose, onLoadTemplate, onQuickStart }) {
  const [activeTab, setActiveTab] = useState('templates'); // 'templates' or 'sessions'
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const templatesByCategory = useMemo(() => listTemplatesByCategory(), []);
  const sessionsByCategory = useMemo(() => listSessionTemplatesByCategory(), []);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return searchTemplates(searchQuery);
  }, [searchQuery]);

  const handleLoadTemplate = (templateKey) => {
    const template = getTemplate(templateKey);
    if (template) {
      onLoadTemplate(template.agents, template.suggestedGoals || []);
      onClose();
    }
  };

  const handleQuickStart = (sessionKey) => {
    const session = getSessionTemplate(sessionKey);
    const template = getTemplate(session.templateKey);
    if (session && template) {
      onQuickStart(template.agents, session.goal);
      onClose();
    }
  };

  const handlePreviewTemplate = (templateKey) => {
    setSelectedTemplate(getTemplate(templateKey));
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay template-browser-overlay" onClick={onClose}>
      <div className="template-browser" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>&times;</button>

        <div className="browser-header">
          <h2>Choose Your Scenario</h2>
          <p className="browser-subtitle">
            Select a template to load agents, or a quick start session to begin immediately
          </p>
        </div>

        {/* Search Bar */}
        <div className="browser-search">
          <input
            type="text"
            placeholder="Search templates and sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}>
              &times;
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="browser-tabs">
          <button
            className={`browser-tab ${activeTab === 'templates' ? 'active' : ''}`}
            onClick={() => setActiveTab('templates')}
          >
            Agent Templates
          </button>
          <button
            className={`browser-tab ${activeTab === 'sessions' ? 'active' : ''}`}
            onClick={() => setActiveTab('sessions')}
          >
            Quick Start Sessions
          </button>
        </div>

        <div className="browser-content">
          {/* Search Results */}
          {searchResults ? (
            <div className="search-results">
              <h3>Search Results ({searchResults.length})</h3>
              {searchResults.length === 0 ? (
                <p className="empty-state">No matches found for "{searchQuery}"</p>
              ) : (
                <div className="template-grid">
                  {searchResults.map(result => (
                    <TemplateCard
                      key={`${result.type}-${result.key}`}
                      template={result}
                      type={result.type}
                      onLoad={() => result.type === 'template'
                        ? handleLoadTemplate(result.key)
                        : handleQuickStart(result.key)
                      }
                      onPreview={() => result.type === 'template' && handlePreviewTemplate(result.key)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Category Sidebar + Content */}
              <div className="browser-layout">
                {/* Categories */}
                <div className="category-sidebar">
                  <button
                    className={`category-item ${selectedCategory === null ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(null)}
                  >
                    <span className="category-icon">🌟</span>
                    <span>All</span>
                  </button>
                  {templateCategories.map(cat => (
                    <button
                      key={cat.id}
                      className={`category-item ${selectedCategory === cat.id ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(cat.id)}
                    >
                      <span className="category-icon">{cat.icon}</span>
                      <span>{cat.name}</span>
                    </button>
                  ))}
                </div>

                {/* Template/Session Grid */}
                <div className="template-content">
                  {activeTab === 'templates' ? (
                    <TemplateGrid
                      categories={templatesByCategory}
                      selectedCategory={selectedCategory}
                      onLoad={handleLoadTemplate}
                      onPreview={handlePreviewTemplate}
                    />
                  ) : (
                    <SessionGrid
                      categories={sessionsByCategory}
                      selectedCategory={selectedCategory}
                      onQuickStart={handleQuickStart}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Template Preview Panel */}
        {selectedTemplate && (
          <TemplatePreview
            template={selectedTemplate}
            onClose={() => setSelectedTemplate(null)}
            onLoad={() => {
              handleLoadTemplate(Object.keys(agentTemplates).find(k => agentTemplates[k] === selectedTemplate));
              setSelectedTemplate(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function TemplateGrid({ categories, selectedCategory, onLoad, onPreview }) {
  const filteredCategories = selectedCategory
    ? categories.filter(c => c.id === selectedCategory)
    : categories;

  return (
    <div className="template-sections">
      {filteredCategories.map(category => (
        <div key={category.id} className="template-section">
          <h3 className="section-title">
            <span className="section-icon">{category.icon}</span>
            {category.name}
          </h3>
          <div className="template-grid">
            {category.templates.map(template => (
              <TemplateCard
                key={template.key}
                template={template}
                type="template"
                onLoad={() => onLoad(template.key)}
                onPreview={() => onPreview(template.key)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SessionGrid({ categories, selectedCategory, onQuickStart }) {
  const filteredCategories = selectedCategory
    ? categories.filter(c => c.id === selectedCategory)
    : categories;

  return (
    <div className="template-sections">
      {filteredCategories.map(category => (
        <div key={category.id} className="template-section">
          <h3 className="section-title">
            <span className="section-icon">{category.icon}</span>
            {category.name}
          </h3>
          <div className="template-grid">
            {category.sessions.map(session => (
              <SessionCard
                key={session.key}
                session={session}
                onQuickStart={() => onQuickStart(session.key)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TemplateCard({ template, type, onLoad, onPreview }) {
  return (
    <div className="template-card">
      <div className="card-header">
        <h4>{template.name}</h4>
        {type === 'template' && (
          <span className="agent-count">{template.agentCount} agents</span>
        )}
      </div>
      <p className="card-description">{template.description}</p>
      <div className="card-actions">
        {type === 'template' && onPreview && (
          <button className="btn btn-ghost btn-sm" onClick={onPreview}>
            Preview
          </button>
        )}
        <button className="btn btn-primary btn-sm" onClick={onLoad}>
          {type === 'template' ? 'Load' : 'Quick Start'}
        </button>
      </div>
    </div>
  );
}

function SessionCard({ session, onQuickStart }) {
  const [showGoal, setShowGoal] = useState(false);

  return (
    <div className="template-card session-card">
      <div className="card-header">
        <h4>{session.name}</h4>
        <span className="quick-start-badge">Quick Start</span>
      </div>
      <p className="card-description">{session.description}</p>

      {showGoal && (
        <div className="session-goal-preview">
          <strong>Goal:</strong>
          <p>{session.goal}</p>
        </div>
      )}

      <div className="card-actions">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowGoal(!showGoal)}
        >
          {showGoal ? 'Hide Goal' : 'Show Goal'}
        </button>
        <button className="btn btn-accent btn-sm" onClick={onQuickStart}>
          Start Now
        </button>
      </div>
    </div>
  );
}

function TemplatePreview({ template, onClose, onLoad }) {
  return (
    <div className="template-preview-panel">
      <div className="preview-header">
        <h3>{template.name}</h3>
        <button className="close-btn" onClick={onClose}>&times;</button>
      </div>

      <p className="preview-description">{template.description}</p>

      <div className="preview-agents">
        <h4>Agents ({template.agents.length})</h4>
        {template.agents.map((agent, i) => (
          <div key={i} className="preview-agent">
            <div className="agent-header">
              <span className="agent-name">{agent.name}</span>
            </div>
            <p className="agent-bio">{agent.bio.slice(0, 150)}...</p>
          </div>
        ))}
      </div>

      {template.suggestedGoals && template.suggestedGoals.length > 0 && (
        <div className="preview-goals">
          <h4>Suggested Goals</h4>
          <ul>
            {template.suggestedGoals.map((goal, i) => (
              <li key={i}>{goal}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="preview-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Back
        </button>
        <button className="btn btn-primary" onClick={onLoad}>
          Load Template
        </button>
      </div>
    </div>
  );
}
