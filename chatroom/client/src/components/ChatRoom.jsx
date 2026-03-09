import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { ChatMessage } from './ChatMessage';

export const ChatRoom = forwardRef(function ChatRoom(
  { messages, streamingMessage, currentSpeaker, onRemixImage },
  ref
) {
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const messageRefs = useRef({});

  // Expose scrollToMessage method
  useImperativeHandle(ref, () => ({
    scrollToMessage: (index) => {
      const messageEl = messageRefs.current[index];
      if (messageEl) {
        messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Highlight briefly
        messageEl.classList.add('highlighted');
        setTimeout(() => messageEl.classList.remove('highlighted'), 2000);
      }
    }
  }));

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingMessage]);

  const allMessages = [...messages];

  // Add streaming message if active
  if (streamingMessage && currentSpeaker) {
    allMessages.push({
      id: 'streaming',
      agentId: currentSpeaker.agentId,
      agentName: currentSpeaker.agentName,
      color: currentSpeaker.color,
      content: streamingMessage,
      timestamp: new Date().toISOString(),
      isStreaming: true,
      tokenCount: 0
    });
  }

  return (
    <div className="chat-room" ref={containerRef}>
      {allMessages.length === 0 ? (
        <div className="chat-empty">
          <div className="chat-empty-content">
            <h3>Chat Room</h3>
            <p>Add agents and start the chat to begin the conversation.</p>
          </div>
        </div>
      ) : (
        <div className="messages-container">
          {allMessages.map((message, index) => (
            <div
              key={message.id}
              ref={el => messageRefs.current[index] = el}
            >
              <ChatMessage
                message={message}
                isStreaming={message.isStreaming}
                onRemixImage={onRemixImage}
              />
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
});
