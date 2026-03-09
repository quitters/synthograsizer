import React, { useState, useEffect } from 'react';

const API_BASE = '/chatroom/api';

export function MemoryViewer({ agents, messages, isOpen, onClose }) {
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [contextWindow, setContextWindow] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState('summary'); // 'summary', 'full', 'tokens'

  useEffect(() => {
    if (isOpen && agents.length > 0 && !selectedAgent) {
      setSelectedAgent(agents[0]);
    }
  }, [isOpen, agents]);

  useEffect(() => {
    if (selectedAgent && isOpen) {
      fetchContextWindow(selectedAgent.id);
    }
  }, [selectedAgent, isOpen, messages.length]);

  const fetchContextWindow = async (agentId) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/agents/${agentId}/context`);
      const data = await res.json();
      setContextWindow(data);
    } catch (err) {
      console.error('Failed to fetch context:', err);
      // Build a local approximation if API not available
      setContextWindow(buildLocalContext(agentId));
    } finally {
      setIsLoading(false);
    }
  };

  const buildLocalContext = (agentId) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return null;

    // Calculate what the agent "remembers"
    const recentMessages = messages.slice(-20);
    const agentMessages = messages.filter(m => m.agentId === agentId);
    const mentionsOfAgent = messages.filter(m =>
      m.content?.toLowerCase().includes(agent.name.toLowerCase())
    );

    // Estimate tokens (rough: ~4 chars per token)
    const bioTokens = Math.ceil((agent.bio?.length || 0) / 4);
    const messageTokens = recentMessages.reduce((sum, m) =>
      sum + Math.ceil((m.content?.length || 0) / 4), 0
    );

    return {
      agent,
      systemPromptTokens: bioTokens + 500, // bio + instructions
      conversationTokens: messageTokens,
      totalTokens: bioTokens + 500 + messageTokens,
      recentMessages,
      agentContributions: agentMessages.length,
      timesMentioned: mentionsOfAgent.length,
      keyTopics: extractKeyTopics(recentMessages),
      lastSpoke: agentMessages[agentMessages.length - 1]?.timestamp,
      memoryItems: buildMemoryItems(agent, messages)
    };
  };

  const extractKeyTopics = (msgs) => {
    const text = msgs.map(m => m.content || '').join(' ').toLowerCase();
    const topics = [];

    // Simple keyword extraction
    const keywords = [
      'strategy', 'marketing', 'budget', 'timeline', 'design', 'user', 'customer',
      'product', 'feature', 'launch', 'brand', 'creative', 'data', 'analysis',
      'growth', 'revenue', 'engagement', 'experience', 'innovation', 'technology'
    ];

    for (const keyword of keywords) {
      const count = (text.match(new RegExp(keyword, 'g')) || []).length;
      if (count >= 2) {
        topics.push({ word: keyword, count });
      }
    }

    return topics.sort((a, b) => b.count - a.count).slice(0, 8);
  };

  const buildMemoryItems = (agent, msgs) => {
    const items = [];

    // System prompt / bio
    items.push({
      type: 'system',
      label: 'Character Bio & Instructions',
      content: agent.bio?.slice(0, 300) + '...',
      tokens: Math.ceil((agent.bio?.length || 0) / 4) + 500,
      priority: 'permanent'
    });

    // Goal
    items.push({
      type: 'goal',
      label: 'Session Goal',
      content: 'Loaded from session configuration',
      tokens: 50,
      priority: 'permanent'
    });

    // Recent conversation
    const recentMsgs = msgs.slice(-15);
    items.push({
      type: 'conversation',
      label: `Recent Conversation (${recentMsgs.length} messages)`,
      content: recentMsgs.map(m => `${m.agentName}: ${m.content?.slice(0, 50)}...`).join('\n'),
      tokens: recentMsgs.reduce((sum, m) => sum + Math.ceil((m.content?.length || 0) / 4), 0),
      priority: 'active'
    });

    // Images in memory
    const imagesInConvo = msgs.filter(m => m.images?.length > 0);
    if (imagesInConvo.length > 0) {
      items.push({
        type: 'images',
        label: `Generated Images (${imagesInConvo.reduce((sum, m) => sum + m.images.length, 0)} total)`,
        content: 'Image metadata and prompts are included in context',
        tokens: imagesInConvo.length * 100,
        priority: 'reference'
      });
    }

    // Tool results
    const toolResults = msgs.filter(m => m.toolResults?.length > 0);
    if (toolResults.length > 0) {
      items.push({
        type: 'tools',
        label: `Research & Search Results (${toolResults.length} uses)`,
        content: 'Web search and URL analysis results',
        tokens: toolResults.length * 200,
        priority: 'reference'
      });
    }

    return items;
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay memory-viewer-overlay" onClick={onClose}>
      <div className="memory-viewer" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>&times;</button>

        <div className="memory-header">
          <h2>🧠 Agent Memory & Context</h2>
          <p className="memory-subtitle">
            See what each agent "remembers" and how their context window is used
          </p>
        </div>

        <div className="memory-layout">
          {/* Agent Selector */}
          <div className="memory-agents">
            <h4>Select Agent</h4>
            {agents.map(agent => (
              <button
                key={agent.id}
                className={`memory-agent-btn ${selectedAgent?.id === agent.id ? 'active' : ''}`}
                onClick={() => setSelectedAgent(agent)}
              >
                <div
                  className="agent-dot"
                  style={{ backgroundColor: agent.color }}
                />
                <span>{agent.name}</span>
              </button>
            ))}
          </div>

          {/* Context Details */}
          <div className="memory-content">
            {isLoading ? (
              <div className="memory-loading">
                <span className="spinner" /> Loading context...
              </div>
            ) : contextWindow ? (
              <>
                {/* View Mode Tabs */}
                <div className="memory-view-tabs">
                  <button
                    className={viewMode === 'summary' ? 'active' : ''}
                    onClick={() => setViewMode('summary')}
                  >
                    Summary
                  </button>
                  <button
                    className={viewMode === 'full' ? 'active' : ''}
                    onClick={() => setViewMode('full')}
                  >
                    Full Context
                  </button>
                  <button
                    className={viewMode === 'tokens' ? 'active' : ''}
                    onClick={() => setViewMode('tokens')}
                  >
                    Token Usage
                  </button>
                </div>

                {viewMode === 'summary' && (
                  <div className="memory-summary">
                    {/* Stats Cards */}
                    <div className="memory-stats">
                      <div className="stat-card">
                        <span className="stat-value">{contextWindow.totalTokens?.toLocaleString() || '~'}</span>
                        <span className="stat-label">Total Tokens</span>
                      </div>
                      <div className="stat-card">
                        <span className="stat-value">{contextWindow.agentContributions || 0}</span>
                        <span className="stat-label">Messages Sent</span>
                      </div>
                      <div className="stat-card">
                        <span className="stat-value">{contextWindow.timesMentioned || 0}</span>
                        <span className="stat-label">Times Mentioned</span>
                      </div>
                      <div className="stat-card">
                        <span className="stat-value">{contextWindow.recentMessages?.length || 0}</span>
                        <span className="stat-label">In Memory</span>
                      </div>
                    </div>

                    {/* Key Topics */}
                    {contextWindow.keyTopics?.length > 0 && (
                      <div className="memory-topics">
                        <h4>Key Topics in Memory</h4>
                        <div className="topic-chips">
                          {contextWindow.keyTopics.map((topic, i) => (
                            <span key={i} className="topic-chip">
                              {topic.word}
                              <span className="topic-count">{topic.count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Last Activity */}
                    {contextWindow.lastSpoke && (
                      <div className="memory-last-active">
                        <span className="label">Last spoke:</span>
                        <span className="value">
                          {new Date(contextWindow.lastSpoke).toLocaleTimeString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {viewMode === 'full' && (
                  <div className="memory-full-context">
                    <h4>Memory Items</h4>
                    <div className="memory-items-list">
                      {contextWindow.memoryItems?.map((item, i) => (
                        <div key={i} className={`memory-item memory-item-${item.type}`}>
                          <div className="memory-item-header">
                            <span className={`memory-priority priority-${item.priority}`}>
                              {item.priority}
                            </span>
                            <span className="memory-item-label">{item.label}</span>
                            <span className="memory-item-tokens">~{item.tokens} tokens</span>
                          </div>
                          <div className="memory-item-content">
                            {item.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {viewMode === 'tokens' && (
                  <div className="memory-token-breakdown">
                    <h4>Token Allocation</h4>
                    <div className="token-bar-container">
                      <div className="token-bar">
                        <div
                          className="token-segment system"
                          style={{ width: `${(contextWindow.systemPromptTokens / contextWindow.totalTokens) * 100}%` }}
                          title={`System Prompt: ${contextWindow.systemPromptTokens} tokens`}
                        />
                        <div
                          className="token-segment conversation"
                          style={{ width: `${(contextWindow.conversationTokens / contextWindow.totalTokens) * 100}%` }}
                          title={`Conversation: ${contextWindow.conversationTokens} tokens`}
                        />
                      </div>
                    </div>
                    <div className="token-legend">
                      <div className="legend-item">
                        <span className="legend-color system" />
                        <span>System Prompt ({contextWindow.systemPromptTokens?.toLocaleString()})</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-color conversation" />
                        <span>Conversation ({contextWindow.conversationTokens?.toLocaleString()})</span>
                      </div>
                    </div>

                    <div className="token-info">
                      <p>
                        <strong>Context Window:</strong> The model can see approximately the last
                        {' '}{Math.round(contextWindow.totalTokens / 750)} pages of conversation.
                      </p>
                      <p>
                        <strong>Memory Persistence:</strong> Earlier messages may be truncated as
                        the conversation grows to stay within limits.
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="memory-empty">
                Select an agent to view their memory
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
