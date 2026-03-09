import React from 'react';

export function TokenMeter({ tokenCount, tokenLimit, turnCount, status }) {
  const percentage = Math.min((tokenCount / tokenLimit) * 100, 100);

  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getStatusColor = () => {
    if (percentage >= 90) return '#ff4444';
    if (percentage >= 75) return '#ffaa00';
    return '#4CAF50';
  };

  return (
    <div className="token-meter">
      <div className="meter-stats">
        <div className="stat">
          <span className="stat-label">Tokens</span>
          <span className="stat-value">
            {formatNumber(tokenCount)} / {formatNumber(tokenLimit)}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Turns</span>
          <span className="stat-value">{turnCount}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Status</span>
          <span className={`stat-value status-${status}`}>
            {status === 'running' && '● Running'}
            {status === 'paused' && '◐ Paused'}
            {status === 'stopped' && '○ Stopped'}
            {status === 'idle' && '○ Idle'}
          </span>
        </div>
      </div>
      <div className="meter-bar">
        <div
          className="meter-fill"
          style={{
            width: `${percentage}%`,
            backgroundColor: getStatusColor()
          }}
        />
      </div>
      <div className="meter-percentage">{percentage.toFixed(1)}%</div>
    </div>
  );
}
