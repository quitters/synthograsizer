import { useEffect, useCallback } from 'react';

/**
 * Keyboard shortcuts hook
 *
 * Shortcuts:
 * - Ctrl/Cmd + Enter: Start/Stop chat
 * - Ctrl/Cmd + S: Save session
 * - Ctrl/Cmd + E: Export as Markdown
 * - Ctrl/Cmd + F: Focus search
 * - Ctrl/Cmd + /: Toggle sidebar
 * - Escape: Close modals
 */
export function useKeyboardShortcuts(handlers = {}) {
  const handleKeyDown = useCallback((e) => {
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    // Ctrl/Cmd + Enter: Start/Stop
    if (isCtrlOrCmd && e.key === 'Enter') {
      e.preventDefault();
      handlers.onToggleChat?.();
      return;
    }

    // Ctrl/Cmd + S: Save
    if (isCtrlOrCmd && e.key === 's') {
      e.preventDefault();
      handlers.onSave?.();
      return;
    }

    // Ctrl/Cmd + E: Export
    if (isCtrlOrCmd && e.key === 'e') {
      e.preventDefault();
      handlers.onExport?.();
      return;
    }

    // Ctrl/Cmd + F: Focus search (if not in input)
    if (isCtrlOrCmd && e.key === 'f' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      handlers.onFocusSearch?.();
      return;
    }

    // Ctrl/Cmd + /: Toggle sidebar
    if (isCtrlOrCmd && e.key === '/') {
      e.preventDefault();
      handlers.onToggleSidebar?.();
      return;
    }

    // Escape: Close
    if (e.key === 'Escape') {
      handlers.onEscape?.();
      return;
    }

    // Ctrl/Cmd + K: Quick command (future)
    if (isCtrlOrCmd && e.key === 'k') {
      e.preventDefault();
      handlers.onQuickCommand?.();
      return;
    }
  }, [handlers]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * Get shortcut display string
 */
export function getShortcutKey(key) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modifier = isMac ? '⌘' : 'Ctrl';

  const shortcuts = {
    toggleChat: `${modifier}+Enter`,
    save: `${modifier}+S`,
    export: `${modifier}+E`,
    search: `${modifier}+F`,
    toggleSidebar: `${modifier}+/`,
    close: 'Esc'
  };

  return shortcuts[key] || '';
}
