import type { CSSProperties } from 'react';

export interface TypeRampProps {
  className?: string;
}

const rowLabel: CSSProperties = {
  fontSize: 11,
  color: 'var(--suite-text-dim)',
  fontFamily: 'var(--suite-font-mono)',
  marginBottom: 2,
};

/**
 * Foundation reference: the suite's three type voices — Space Grotesk for
 * display (letter-spaced tool titles), Inter for UI/body, JetBrains Mono
 * for code, prompts, and data.
 */
export function TypeRamp({ className }: TypeRampProps) {
  return (
    <div
      className={className}
      style={{ color: 'var(--suite-text)', display: 'grid', gap: 18 }}
    >
      <div>
        <div style={rowLabel}>--suite-font-display · Space Grotesk · titles</div>
        <div
          style={{
            fontFamily: 'var(--suite-font-display)',
            fontSize: 24,
            letterSpacing: 3,
            color: 'var(--suite-teal)',
          }}
        >
          VIDEORAMA
        </div>
        <div style={{ fontFamily: 'var(--suite-font-display)', fontSize: 18 }}>
          Prompt-driven generative art
        </div>
      </div>
      <div>
        <div style={rowLabel}>--suite-font-ui · Inter · UI &amp; body</div>
        <div style={{ fontFamily: 'var(--suite-font-ui)', fontSize: 13 }}>
          Describe the set, pick a signal path, and set the budget cap.
        </div>
        <div
          style={{
            fontFamily: 'var(--suite-font-ui)',
            fontSize: 12,
            color: 'var(--suite-text-mute)',
          }}
        >
          Muted caption text for hints and sub-lines.
        </div>
      </div>
      <div>
        <div style={rowLabel}>--suite-font-mono · JetBrains Mono · code / data</div>
        <div style={{ fontFamily: 'var(--suite-font-mono)', fontSize: 12 }}>
          {'{{subject}} performing on {{stage}}, shot on {{format}}'}
        </div>
      </div>
    </div>
  );
}
