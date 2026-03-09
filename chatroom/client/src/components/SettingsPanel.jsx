import React, { useState, useEffect } from 'react';

const API_BASE = '/chatroom/api';

export function SettingsPanel({ agents, isRunning, onBranchRestored }) {
  const [speakingOrder, setSpeakingOrder] = useState('dynamic');
  const [priorities, setPriorities] = useState({});
  const [branches, setBranches] = useState([]);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [activeTab, setActiveTab] = useState('order');

  // Consensus detection settings
  const [consensusSettings, setConsensusSettings] = useState({
    enabled: true,
    sensitivity: 'medium', // 'low', 'medium', 'high', 'manual'
    requireExplicitMarker: false,
    minSignoffCount: 2,
    customPhrases: []
  });
  const [newPhrase, setNewPhrase] = useState('');

  // Fetch current settings on mount
  useEffect(() => {
    fetchSpeakingOrder();
    fetchBranches();
    fetchConsensusSettings();
  }, []);

  const fetchConsensusSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/consensus-settings`);
      if (res.ok) {
        const data = await res.json();
        setConsensusSettings(data);
      }
    } catch (err) {
      console.error('Failed to fetch consensus settings:', err);
    }
  };

  const updateConsensusSetting = async (key, value) => {
    const newSettings = { ...consensusSettings, [key]: value };
    setConsensusSettings(newSettings);

    try {
      await fetch(`${API_BASE}/chat/consensus-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
    } catch (err) {
      console.error('Failed to update consensus settings:', err);
    }
  };

  const addCustomPhrase = () => {
    if (!newPhrase.trim()) return;
    const phrases = [...consensusSettings.customPhrases, newPhrase.trim().toLowerCase()];
    updateConsensusSetting('customPhrases', phrases);
    setNewPhrase('');
  };

  const removeCustomPhrase = (phrase) => {
    const phrases = consensusSettings.customPhrases.filter(p => p !== phrase);
    updateConsensusSetting('customPhrases', phrases);
  };

  const fetchSpeakingOrder = async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/speaking-order`);
      const data = await res.json();
      setSpeakingOrder(data.mode);
      setPriorities(data.priorities || {});
    } catch (err) {
      console.error('Failed to fetch speaking order:', err);
    }
  };

  const fetchBranches = async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/branches`);
      const data = await res.json();
      setBranches(data.branches || []);
    } catch (err) {
      console.error('Failed to fetch branches:', err);
    }
  };

  const handleSpeakingOrderChange = async (mode) => {
    try {
      const res = await fetch(`${API_BASE}/chat/speaking-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      const data = await res.json();
      if (data.success) {
        setSpeakingOrder(mode);
      }
    } catch (err) {
      console.error('Failed to set speaking order:', err);
    }
  };

  const handlePriorityChange = async (agentId, priority) => {
    try {
      const res = await fetch(`${API_BASE}/chat/speaking-order/priority`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, priority: parseInt(priority) })
      });
      const data = await res.json();
      if (data.success) {
        setPriorities(prev => ({ ...prev, [agentId]: priority }));
      }
    } catch (err) {
      console.error('Failed to set priority:', err);
    }
  };

  const handleCreateBranch = async () => {
    if (!branchName.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/chat/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: branchName.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setBranches(prev => [...prev, data.branch]);
        setShowBranchModal(false);
        setBranchName('');
      }
    } catch (err) {
      console.error('Failed to create branch:', err);
    }
  };

  const handleRestoreBranch = async (branchId) => {
    if (!confirm('Restore this branch? Current conversation will be replaced.')) return;

    try {
      const res = await fetch(`${API_BASE}/chat/branches/${branchId}/restore`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        if (onBranchRestored) {
          onBranchRestored(data);
        }
      }
    } catch (err) {
      console.error('Failed to restore branch:', err);
      alert('Failed to restore branch');
    }
  };

  const handleDeleteBranch = async (branchId) => {
    if (!confirm('Delete this branch point? This cannot be undone.')) return;

    try {
      const res = await fetch(`${API_BASE}/chat/branches/${branchId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setBranches(prev => prev.filter(b => b.id !== branchId));
      }
    } catch (err) {
      console.error('Failed to delete branch:', err);
    }
  };

  const speakingOrderModes = [
    { value: 'dynamic', label: 'Dynamic', desc: 'AI-driven based on context and expertise' },
    { value: 'round-robin', label: 'Round Robin', desc: 'Agents take turns in fixed order' },
    { value: 'priority', label: 'Priority', desc: 'Higher priority agents speak more often' },
    { value: 'random', label: 'Random', desc: 'Randomly select next speaker' }
  ];

  return (
    <div className="settings-panel">
      <div className="settings-tabs">
        <button
          className={`settings-tab ${activeTab === 'order' ? 'active' : ''}`}
          onClick={() => setActiveTab('order')}
        >
          Speaking
        </button>
        <button
          className={`settings-tab ${activeTab === 'consensus' ? 'active' : ''}`}
          onClick={() => setActiveTab('consensus')}
        >
          Consensus
        </button>
        <button
          className={`settings-tab ${activeTab === 'branches' ? 'active' : ''}`}
          onClick={() => setActiveTab('branches')}
        >
          Branches
        </button>
      </div>

      <div className="settings-content">
        {activeTab === 'order' && (
          <div className="speaking-order-settings">
            <h4>Speaking Order Mode</h4>
            <div className="order-modes">
              {speakingOrderModes.map(mode => (
                <label key={mode.value} className="order-mode-option">
                  <input
                    type="radio"
                    name="speakingOrder"
                    value={mode.value}
                    checked={speakingOrder === mode.value}
                    onChange={() => handleSpeakingOrderChange(mode.value)}
                    disabled={isRunning}
                  />
                  <div className="mode-info">
                    <span className="mode-label">{mode.label}</span>
                    <span className="mode-desc">{mode.desc}</span>
                  </div>
                </label>
              ))}
            </div>

            {speakingOrder === 'priority' && agents.length > 0 && (
              <div className="priority-settings">
                <h4>Agent Priorities</h4>
                <p className="help-text">Higher values = more likely to speak</p>
                <div className="priority-list">
                  {agents.map(agent => (
                    <div key={agent.id} className="priority-item">
                      <span
                        className="agent-dot"
                        style={{ backgroundColor: agent.color }}
                      />
                      <span className="agent-name">{agent.name}</span>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={priorities[agent.id] || 1}
                        onChange={(e) => handlePriorityChange(agent.id, e.target.value)}
                        disabled={isRunning}
                      />
                      <span className="priority-value">{priorities[agent.id] || 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'consensus' && (
          <div className="consensus-settings">
            <h4>Consensus Detection</h4>
            <p className="help-text">
              Control when the conversation automatically ends based on agent agreement.
            </p>

            {/* Enable/Disable */}
            <label className="toggle-setting">
              <input
                type="checkbox"
                checked={consensusSettings.enabled}
                onChange={(e) => updateConsensusSetting('enabled', e.target.checked)}
                disabled={isRunning}
              />
              <span>Auto-detect consensus</span>
            </label>

            {consensusSettings.enabled && (
              <>
                {/* Sensitivity */}
                <div className="setting-group">
                  <label>Detection Sensitivity</label>
                  <div className="sensitivity-options">
                    {[
                      { value: 'low', label: 'Low', desc: 'Only explicit [CONSENSUS REACHED] marker' },
                      { value: 'medium', label: 'Medium', desc: 'Common agreement phrases' },
                      { value: 'high', label: 'High', desc: 'Detect subtle agreement and sign-offs' },
                      { value: 'manual', label: 'Manual Only', desc: 'Never auto-stop, user must click Stop' }
                    ].map(opt => (
                      <label key={opt.value} className="sensitivity-option">
                        <input
                          type="radio"
                          name="sensitivity"
                          value={opt.value}
                          checked={consensusSettings.sensitivity === opt.value}
                          onChange={() => updateConsensusSetting('sensitivity', opt.value)}
                          disabled={isRunning}
                        />
                        <div className="option-content">
                          <span className="option-label">{opt.label}</span>
                          <span className="option-desc">{opt.desc}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Require Explicit Marker */}
                <label className="toggle-setting">
                  <input
                    type="checkbox"
                    checked={consensusSettings.requireExplicitMarker}
                    onChange={(e) => updateConsensusSetting('requireExplicitMarker', e.target.checked)}
                    disabled={isRunning}
                  />
                  <span>Require [CONSENSUS REACHED] marker</span>
                </label>

                {/* Minimum Sign-off Count */}
                <div className="setting-group">
                  <label>Minimum agents signing off</label>
                  <div className="signoff-slider">
                    <input
                      type="range"
                      min="2"
                      max={Math.max(agents.length, 3)}
                      value={consensusSettings.minSignoffCount}
                      onChange={(e) => updateConsensusSetting('minSignoffCount', parseInt(e.target.value))}
                      disabled={isRunning}
                    />
                    <span className="signoff-value">{consensusSettings.minSignoffCount} agents</span>
                  </div>
                  <p className="help-text">
                    How many agents must use sign-off language before ending.
                  </p>
                </div>

                {/* Custom Phrases */}
                <div className="setting-group">
                  <label>Custom Consensus Phrases</label>
                  <p className="help-text">
                    Add phrases that should trigger consensus detection.
                  </p>
                  <div className="custom-phrases">
                    {consensusSettings.customPhrases.map((phrase, i) => (
                      <div key={i} className="phrase-chip">
                        <span>{phrase}</span>
                        <button
                          onClick={() => removeCustomPhrase(phrase)}
                          disabled={isRunning}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="add-phrase">
                    <input
                      type="text"
                      placeholder="Add a phrase..."
                      value={newPhrase}
                      onChange={(e) => setNewPhrase(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addCustomPhrase()}
                      disabled={isRunning}
                    />
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={addCustomPhrase}
                      disabled={isRunning || !newPhrase.trim()}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Built-in Phrases Reference */}
            <details className="builtin-phrases">
              <summary>View built-in detection phrases</summary>
              <div className="phrases-list">
                <strong>Consensus phrases:</strong>
                <ul>
                  <li>we have consensus</li>
                  <li>consensus reached</li>
                  <li>brief is complete</li>
                  <li>unanimous agreement</li>
                  <li>goal has been achieved</li>
                  <li>mission accomplished</li>
                </ul>
                <strong>Sign-off phrases:</strong>
                <ul>
                  <li>signing off</li>
                  <li>great session</li>
                  <li>thanks everyone</li>
                  <li>that concludes</li>
                  <li>wrapping up</li>
                </ul>
              </div>
            </details>
          </div>
        )}

        {activeTab === 'branches' && (
          <div className="branch-settings">
            <div className="branch-header">
              <h4>Branch Points</h4>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => setShowBranchModal(true)}
                disabled={isRunning}
                title={isRunning ? 'Pause chat to create branch' : 'Save current state'}
              >
                + Create Branch
              </button>
            </div>

            {branches.length === 0 ? (
              <p className="empty-state">
                No branch points saved. Create a branch to save the current conversation state for later exploration.
              </p>
            ) : (
              <div className="branch-list">
                {branches.map(branch => (
                  <div key={branch.id} className="branch-item">
                    <div className="branch-info">
                      <span className="branch-name">{branch.name}</span>
                      <span className="branch-meta">
                        {branch.messageCount} messages
                        {branch.createdAt && (
                          <> · {new Date(branch.createdAt).toLocaleString()}</>
                        )}
                      </span>
                    </div>
                    <div className="branch-actions">
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleRestoreBranch(branch.id)}
                        title="Restore this branch"
                      >
                        Restore
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDeleteBranch(branch.id)}
                        title="Delete this branch"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="branch-help">
              <p><strong>What are branches?</strong></p>
              <p>
                Branches let you save the conversation at any point. You can then restore
                that state later to explore "what if" scenarios or try different directions.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Create Branch Modal */}
      {showBranchModal && (
        <div className="modal-overlay" onClick={() => setShowBranchModal(false)}>
          <div className="modal branch-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowBranchModal(false)}>
              &times;
            </button>
            <h3>Create Branch Point</h3>
            <p>Save the current conversation state to explore later.</p>
            <input
              type="text"
              placeholder="Branch name (e.g., 'Before marketing discussion')..."
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
              autoFocus
            />
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowBranchModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateBranch}
                disabled={!branchName.trim()}
              >
                Create Branch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
