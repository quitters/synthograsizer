import React, { useState, useCallback } from 'react';

// Simple markdown parser for common elements
function parseMarkdown(text) {
  if (!text) return [];

  const elements = [];
  const lines = text.split('\n');
  let inCodeBlock = false;
  let codeBlockContent = [];
  let codeBlockLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block detection
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        codeBlockContent = [];
      } else {
        elements.push({
          type: 'codeblock',
          lang: codeBlockLang,
          content: codeBlockContent.join('\n'),
          key: `codeblock-${i}`
        });
        inCodeBlock = false;
        codeBlockLang = '';
        codeBlockContent = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push({ type: 'h3', content: line.slice(4), key: `h3-${i}` });
    } else if (line.startsWith('## ')) {
      elements.push({ type: 'h2', content: line.slice(3), key: `h2-${i}` });
    } else if (line.startsWith('# ')) {
      elements.push({ type: 'h1', content: line.slice(2), key: `h1-${i}` });
    }
    // Bullet points
    else if (line.match(/^[\*\-]\s/)) {
      elements.push({ type: 'bullet', content: line.slice(2), key: `bullet-${i}` });
    }
    // Numbered lists
    else if (line.match(/^\d+\.\s/)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push({ type: 'numbered', num: match[1], content: match[2], key: `num-${i}` });
      }
    }
    // Horizontal rule
    else if (line.match(/^---+$/)) {
      elements.push({ type: 'hr', key: `hr-${i}` });
    }
    // Blockquote
    else if (line.startsWith('> ')) {
      elements.push({ type: 'blockquote', content: line.slice(2), key: `quote-${i}` });
    }
    // Regular paragraph
    else {
      elements.push({ type: 'text', content: line, key: `text-${i}` });
    }
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockContent.length > 0) {
    elements.push({
      type: 'codeblock',
      lang: codeBlockLang,
      content: codeBlockContent.join('\n'),
      key: 'codeblock-unclosed'
    });
  }

  return elements;
}

// Render inline markdown (bold, italic, code, links)
function renderInlineMarkdown(text) {
  if (!text) return null;

  // Split and process inline elements
  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold: **text** or __text__
    let match = remaining.match(/^(.*?)(\*\*|__)(.+?)\2(.*)$/s);
    if (match) {
      if (match[1]) parts.push(<span key={key++}>{match[1]}</span>);
      parts.push(<strong key={key++}>{match[3]}</strong>);
      remaining = match[4];
      continue;
    }

    // Italic: *text* or _text_
    match = remaining.match(/^(.*?)(\*|_)([^\*_]+)\2(.*)$/s);
    if (match) {
      if (match[1]) parts.push(<span key={key++}>{match[1]}</span>);
      parts.push(<em key={key++}>{match[3]}</em>);
      remaining = match[4];
      continue;
    }

    // Inline code: `code`
    match = remaining.match(/^(.*?)`([^`]+)`(.*)$/s);
    if (match) {
      if (match[1]) parts.push(<span key={key++}>{match[1]}</span>);
      parts.push(<code key={key++} className="inline-code">{match[2]}</code>);
      remaining = match[3];
      continue;
    }

    // Links: [text](url)
    match = remaining.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)(.*)$/s);
    if (match) {
      if (match[1]) parts.push(<span key={key++}>{match[1]}</span>);
      parts.push(
        <a key={key++} href={match[3]} target="_blank" rel="noopener noreferrer">
          {match[2]}
        </a>
      );
      remaining = match[4];
      continue;
    }

    // No more matches, add remaining text
    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return parts;
}

function MarkdownContent({ content }) {
  const elements = parseMarkdown(content);

  return (
    <div className="markdown-content">
      {elements.map(el => {
        switch (el.type) {
          case 'h1':
            return <h1 key={el.key} className="md-h1">{renderInlineMarkdown(el.content)}</h1>;
          case 'h2':
            return <h2 key={el.key} className="md-h2">{renderInlineMarkdown(el.content)}</h2>;
          case 'h3':
            return <h3 key={el.key} className="md-h3">{renderInlineMarkdown(el.content)}</h3>;
          case 'bullet':
            return <div key={el.key} className="md-bullet">• {renderInlineMarkdown(el.content)}</div>;
          case 'numbered':
            return <div key={el.key} className="md-numbered">{el.num}. {renderInlineMarkdown(el.content)}</div>;
          case 'hr':
            return <hr key={el.key} className="md-hr" />;
          case 'blockquote':
            return <blockquote key={el.key} className="md-quote">{renderInlineMarkdown(el.content)}</blockquote>;
          case 'codeblock':
            return (
              <div key={el.key} className="md-codeblock">
                {el.lang && <div className="codeblock-lang">{el.lang}</div>}
                <pre><code>{el.content}</code></pre>
                <button
                  className="copy-code-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(el.content);
                  }}
                  title="Copy code"
                >
                  📋
                </button>
              </div>
            );
          case 'text':
          default:
            if (!el.content.trim()) {
              return <div key={el.key} className="md-spacer" />;
            }
            return <p key={el.key} className="md-paragraph">{renderInlineMarkdown(el.content)}</p>;
        }
      })}
    </div>
  );
}

export function ChatMessage({ message, isStreaming, onRemixImage }) {
  const isUser = message.isUser || message.agentId === 'user';
  const [expandedImage, setExpandedImage] = useState(null);
  const [expandedToolResult, setExpandedToolResult] = useState(null);
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleRemix = (image) => {
    setExpandedImage(null);
    if (onRemixImage) {
      onRemixImage(image);
    }
  };

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [message.content]);

  return (
    <div
      className={`chat-message ${isUser ? 'user-message' : 'agent-message'}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="message-header">
        <div
          className="message-avatar"
          style={{ backgroundColor: message.color || (isUser ? '#888' : '#666') }}
        >
          {message.agentName?.split(' ').map(n => n[0]).join('') || '?'}
        </div>
        <span className="message-author">{message.agentName}</span>
        {isStreaming && <span className="streaming-indicator">typing...</span>}
        <span className="message-time">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>

        {/* Message Actions */}
        <div className={`message-actions ${showActions || copied ? 'visible' : ''}`}>
          <button
            className={`action-btn ${copied ? 'copied' : ''}`}
            onClick={handleCopy}
            title="Copy message"
          >
            {copied ? '✓' : '📋'}
          </button>
        </div>
      </div>

      <div className="message-content">
        {isStreaming ? (
          // Plain text while streaming for performance
          <>
            {message.content && message.content.split('\n').map((line, i) => (
              <React.Fragment key={i}>
                {line}
                {i < message.content.split('\n').length - 1 && <br />}
              </React.Fragment>
            ))}
            <span className="cursor">|</span>
          </>
        ) : (
          // Markdown rendering for completed messages
          <MarkdownContent content={message.content} />
        )}
      </div>

      {/* Display images if present */}
      {message.images && message.images.length > 0 && (
        <div className="message-images">
          {message.images.map((image) => (
            <div key={image.id} className="message-image-container">
              <img
                src={`data:${image.mimeType};base64,${image.imageData}`}
                alt={image.caption || image.prompt}
                className="message-image"
                onClick={() => setExpandedImage(image)}
              />
              {image.caption && (
                <div className="image-caption">{image.caption}</div>
              )}
              {image.referenceId && (
                <div className="image-remix-badge">Remix</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Display tool results if present */}
      {message.toolResults && message.toolResults.length > 0 && (
        <div className="message-tool-results">
          {message.toolResults.map((result, index) => (
            <ToolResultCard
              key={index}
              result={result}
              onExpand={() => setExpandedToolResult(result)}
            />
          ))}
        </div>
      )}

      {message.tokenCount > 0 && (
        <div className="message-tokens">
          {message.tokenCount} tokens
        </div>
      )}

      {/* Expanded image modal with remix option */}
      {expandedImage && (
        <div className="image-modal-overlay" onClick={() => setExpandedImage(null)}>
          <div className="image-modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setExpandedImage(null)}>
              &times;
            </button>
            <img
              src={`data:${expandedImage.mimeType};base64,${expandedImage.imageData}`}
              alt={expandedImage.caption || expandedImage.prompt}
              className="expanded-image"
            />
            {expandedImage.caption && (
              <div className="expanded-image-caption">{expandedImage.caption}</div>
            )}
            <div className="image-prompt">
              <strong>Prompt:</strong> {expandedImage.prompt}
            </div>
            <div className="image-actions">
              <button
                className="btn btn-primary"
                onClick={() => handleRemix(expandedImage)}
              >
                Remix / Iterate
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = `data:${expandedImage.mimeType};base64,${expandedImage.imageData}`;
                  link.download = `image_${expandedImage.id}.png`;
                  link.click();
                }}
              >
                Download
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  navigator.clipboard.writeText(expandedImage.id);
                  alert('Image ID copied to clipboard');
                }}
              >
                Copy ID
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded tool result modal */}
      {expandedToolResult && (
        <div className="modal-overlay" onClick={() => setExpandedToolResult(null)}>
          <div className="modal tool-result-modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setExpandedToolResult(null)}>
              &times;
            </button>
            <ToolResultDetails result={expandedToolResult} />
          </div>
        </div>
      )}
    </div>
  );
}

function ToolResultCard({ result, onExpand }) {
  const getIcon = (type) => {
    switch (type) {
      case 'search': return '🔍';
      case 'url': return '🔗';
      case 'research': return '📚';
      default: return '🛠️';
    }
  };

  const getTitle = (result) => {
    switch (result.type) {
      case 'search': return `Search: ${result.query}`;
      case 'url': return `URL: ${truncateUrl(result.url)}`;
      case 'research': return `Research: ${result.query}`;
      default: return 'Tool Result';
    }
  };

  if (result.error) {
    return (
      <div className="tool-result-card tool-result-error">
        <span className="tool-icon">⚠️</span>
        <span className="tool-title">{getTitle(result)}</span>
        <span className="tool-error">{result.error}</span>
      </div>
    );
  }

  return (
    <div className="tool-result-card" onClick={onExpand}>
      <span className="tool-icon">{getIcon(result.type)}</span>
      <div className="tool-result-content">
        <span className="tool-title">{getTitle(result)}</span>
        {result.summary && (
          <span className="tool-summary">{truncate(result.summary, 100)}</span>
        )}
        {result.sources && result.sources.length > 0 && (
          <span className="tool-sources-count">{result.sources.length} sources</span>
        )}
      </div>
      <span className="tool-expand-hint">Click to expand</span>
    </div>
  );
}

function ToolResultDetails({ result }) {
  return (
    <div className="tool-result-details">
      <h3>
        {result.type === 'search' && '🔍 Web Search Results'}
        {result.type === 'url' && '🔗 URL Analysis'}
        {result.type === 'research' && '📚 Research Results'}
      </h3>

      <div className="tool-query">
        <strong>Query:</strong> {result.query || result.url}
      </div>

      {result.summary && (
        <div className="tool-full-summary">
          <strong>Summary:</strong>
          <div className="summary-text">{result.summary}</div>
        </div>
      )}

      {result.sources && result.sources.length > 0 && (
        <div className="tool-sources">
          <strong>Sources:</strong>
          <ul className="sources-list">
            {result.sources.map((source, i) => (
              <li key={i}>
                <a href={source.uri} target="_blank" rel="noopener noreferrer">
                  [{source.index}] {source.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.searchQueries && result.searchQueries.length > 0 && (
        <div className="tool-search-queries">
          <strong>Search Queries Used:</strong>
          <ul>
            {result.searchQueries.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function truncate(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

function truncateUrl(url, maxLength = 40) {
  if (!url) return '';
  try {
    const urlObj = new URL(url);
    const display = urlObj.hostname + urlObj.pathname;
    return truncate(display, maxLength);
  } catch {
    return truncate(url, maxLength);
  }
}
