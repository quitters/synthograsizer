import React, { useState, useEffect, useRef, useMemo } from 'react';

export function MessageSearch({ messages, onJumpToMessage, isVisible, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  const results = useMemo(() => {
    if (!query.trim()) return [];

    const lowerQuery = query.toLowerCase();
    return messages
      .map((msg, index) => ({ msg, index }))
      .filter(({ msg }) =>
        msg.content?.toLowerCase().includes(lowerQuery) ||
        msg.agentName?.toLowerCase().includes(lowerQuery)
      )
      .slice(0, 20); // Limit results
  }, [messages, query]);

  useEffect(() => {
    if (isVisible) {
      inputRef.current?.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isVisible]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      onJumpToMessage(results[selectedIndex].index);
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isVisible) return null;

  return (
    <div className="message-search">
      <div className="search-input-container">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search messages..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="search-close" onClick={onClose}>×</button>
      </div>

      {query && (
        <div className="search-results">
          {results.length === 0 ? (
            <div className="no-results">No messages found</div>
          ) : (
            results.map(({ msg, index }, i) => (
              <div
                key={msg.id || index}
                className={`search-result ${i === selectedIndex ? 'selected' : ''}`}
                onClick={() => {
                  onJumpToMessage(index);
                  onClose();
                }}
              >
                <span className="result-author">{msg.agentName}</span>
                <span className="result-preview">
                  {highlightMatch(msg.content, query)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function highlightMatch(text, query) {
  if (!text) return '';

  const maxLength = 80;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return text.slice(0, maxLength) + (text.length > maxLength ? '...' : '');
  }

  // Get context around the match
  const start = Math.max(0, matchIndex - 20);
  const end = Math.min(text.length, matchIndex + query.length + 40);

  let preview = '';
  if (start > 0) preview += '...';
  preview += text.slice(start, matchIndex);
  preview += `**${text.slice(matchIndex, matchIndex + query.length)}**`;
  preview += text.slice(matchIndex + query.length, end);
  if (end < text.length) preview += '...';

  return preview;
}
