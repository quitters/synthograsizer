import React, { useState, useEffect, useRef, useMemo } from 'react';

export function CommandPalette({
  isOpen,
  onClose,
  commands,
  onExecute
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const lowerQuery = query.toLowerCase();
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(lowerQuery) ||
      cmd.description?.toLowerCase().includes(lowerQuery) ||
      cmd.keywords?.some(k => k.toLowerCase().includes(lowerQuery))
    );
  }, [commands, query]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev =>
            prev < filteredCommands.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev =>
            prev > 0 ? prev - 1 : filteredCommands.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            onExecute(filteredCommands[selectedIndex]);
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onExecute, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector('.command-item.selected');
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        <div className="command-input-wrapper">
          <span className="command-icon">⌘</span>
          <input
            ref={inputRef}
            type="text"
            className="command-input"
            placeholder="Type a command..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="command-hint">ESC to close</span>
        </div>

        <div className="command-list" ref={listRef}>
          {filteredCommands.length === 0 ? (
            <div className="command-empty">No matching commands</div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <div
                key={cmd.id}
                className={`command-item ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => {
                  onExecute(cmd);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="command-item-left">
                  {cmd.icon && <span className="command-item-icon">{cmd.icon}</span>}
                  <div className="command-item-text">
                    <span className="command-label">{cmd.label}</span>
                    {cmd.description && (
                      <span className="command-description">{cmd.description}</span>
                    )}
                  </div>
                </div>
                {cmd.shortcut && (
                  <span className="command-shortcut">{cmd.shortcut}</span>
                )}
              </div>
            ))
          )}
        </div>

        <div className="command-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Select</span>
          <span><kbd>esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}

// Pre-built command definitions
export function useCommands({
  isRunning,
  isPaused,
  agents,
  messages,
  onStartChat,
  onStopChat,
  onPauseChat,
  onResumeChat,
  onReset,
  onOpenTemplates,
  onOpenSearch,
  onOpenSettings,
  onOpenMemory,
  onToggleTheme,
  onExportMarkdown,
  onExportJSON,
  onSaveSession,
  onToggleSidebar
}) {
  return useMemo(() => {
    const commands = [];

    // Chat controls
    if (!isRunning) {
      if (agents.length >= 2) {
        commands.push({
          id: 'start-chat',
          icon: '▶️',
          label: 'Start Chat',
          description: 'Begin the conversation',
          shortcut: '⌘+Enter',
          keywords: ['begin', 'play', 'run'],
          action: onStartChat
        });
      }
    } else {
      if (isPaused) {
        commands.push({
          id: 'resume-chat',
          icon: '▶️',
          label: 'Resume Chat',
          description: 'Continue the conversation',
          keywords: ['continue', 'play'],
          action: onResumeChat
        });
      } else {
        commands.push({
          id: 'pause-chat',
          icon: '⏸️',
          label: 'Pause Chat',
          description: 'Temporarily pause the conversation',
          keywords: ['stop', 'wait'],
          action: onPauseChat
        });
      }

      commands.push({
        id: 'stop-chat',
        icon: '⏹️',
        label: 'Stop Chat',
        description: 'End the conversation',
        shortcut: '⌘+Enter',
        keywords: ['end', 'finish', 'quit'],
        action: onStopChat
      });
    }

    // Templates and agents
    commands.push({
      id: 'open-templates',
      icon: '📋',
      label: 'Browse Templates',
      description: 'Load agent templates or quick start sessions',
      keywords: ['agents', 'presets', 'scenarios'],
      action: onOpenTemplates
    });

    // Search
    commands.push({
      id: 'search-messages',
      icon: '🔍',
      label: 'Search Messages',
      description: 'Find text in conversation',
      shortcut: '⌘+K',
      keywords: ['find', 'filter'],
      action: onOpenSearch
    });

    // Settings
    commands.push({
      id: 'open-settings',
      icon: '⚙️',
      label: 'Open Settings',
      description: 'Speaking order and branching',
      keywords: ['preferences', 'options', 'configure'],
      action: onOpenSettings
    });

    // Memory viewer
    if (agents.length > 0) {
      commands.push({
        id: 'open-memory',
        icon: '🧠',
        label: 'View Agent Memory',
        description: 'See what agents remember and context window usage',
        keywords: ['context', 'tokens', 'remember'],
        action: onOpenMemory
      });
    }

    // Theme
    commands.push({
      id: 'toggle-theme',
      icon: '🌓',
      label: 'Toggle Theme',
      description: 'Switch between dark and light mode',
      keywords: ['dark', 'light', 'mode', 'color'],
      action: onToggleTheme
    });

    // Export options
    if (messages.length > 0) {
      commands.push({
        id: 'export-markdown',
        icon: '📄',
        label: 'Export as Markdown',
        description: 'Download conversation as .md file',
        shortcut: '⌘+E',
        keywords: ['download', 'save', 'md'],
        action: onExportMarkdown
      });

      commands.push({
        id: 'export-json',
        icon: '📦',
        label: 'Export as JSON',
        description: 'Download full conversation data',
        keywords: ['download', 'data', 'backup'],
        action: onExportJSON
      });
    }

    // Session management
    commands.push({
      id: 'save-session',
      icon: '💾',
      label: 'Save Session',
      description: 'Save current conversation to browser storage',
      shortcut: '⌘+S',
      keywords: ['store', 'keep'],
      action: onSaveSession
    });

    // Reset
    commands.push({
      id: 'reset',
      icon: '🗑️',
      label: 'Reset All',
      description: 'Clear agents and conversation',
      keywords: ['clear', 'new', 'fresh'],
      action: onReset
    });

    // UI controls
    commands.push({
      id: 'toggle-sidebar',
      icon: '📐',
      label: 'Toggle Sidebar',
      description: 'Show or hide the agent sidebar',
      shortcut: '⌘+B',
      keywords: ['panel', 'agents', 'hide', 'show'],
      action: onToggleSidebar
    });

    return commands;
  }, [
    isRunning, isPaused, agents, messages,
    onStartChat, onStopChat, onPauseChat, onResumeChat, onReset,
    onOpenTemplates, onOpenSearch, onOpenSettings, onOpenMemory, onToggleTheme,
    onExportMarkdown, onExportJSON, onSaveSession, onToggleSidebar
  ]);
}
