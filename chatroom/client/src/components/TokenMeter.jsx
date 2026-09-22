import React from 'react';

/**
 * `tokenCount` is the budget counter — what the agents produced (output +
 * thinking). `usage` is the full cost picture reported by the API, including
 * input tokens, which dominate in this app because every turn re-sends the
 * system prompt and transcript. The two measure different things on purpose.
 */
export function TokenMeter({ tokenCount, tokenLimit, turnCount, status, usage }) {
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

  const hasUsage = usage && usage.totalTokens > 0;
  const cacheRate = hasUsage && usage.inputTokens > 0
    ? (usage.cachedTokens / usage.inputTokens) * 100
    : 0;
  // A turn whose usage the API didn't report fell back to the character
  // estimate, so the totals below understate that turn.
  const isPartlyEstimated = hasUsage && usage.estimatedTurns > 0;

  return (
    <div className="token-meter">
      <div className="meter-stats">
        <div className="stat">
          <span className="stat-label">Generated</span>
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

      {hasUsage && (
        <div
          className="meter-usage"
          title={
            isPartlyEstimated
              ? `${usage.estimatedTurns} turn(s) had no usage reported and are excluded from these totals`
              : 'Reported by the Gemini API for this run'
          }
        >
          <div className="usage-row">
            <span className="usage-label">In</span>
            <span className="usage-value">{formatNumber(usage.inputTokens)}</span>
          </div>
          <div className="usage-row">
            <span className="usage-label">Out</span>
            <span className="usage-value">{formatNumber(usage.outputTokens)}</span>
          </div>
          <div className="usage-row">
            <span className="usage-label">Thought</span>
            <span className="usage-value">{formatNumber(usage.thoughtTokens)}</span>
          </div>
          <div className="usage-row">
            <span className="usage-label">Cached</span>
            <span className="usage-value">
              {formatNumber(usage.cachedTokens)}
              {usage.inputTokens > 0 && ` (${cacheRate.toFixed(0)}%)`}
            </span>
          </div>
          <div className="usage-row usage-total">
            <span className="usage-label">Billed</span>
            <span className="usage-value">
              {formatNumber(usage.totalTokens)}{isPartlyEstimated ? '+' : ''}
            </span>
          </div>
          {usage.searchQueries > 0 && (
            <div
              className="usage-row usage-search"
              title="Grounding bills per search query the model runs, not per prompt, so this is counted separately from tokens"
            >
              <span className="usage-label">Searches</span>
              <span className="usage-value">{formatNumber(usage.searchQueries)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
