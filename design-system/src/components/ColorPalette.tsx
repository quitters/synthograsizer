import type { CSSProperties } from 'react';

export interface ColorPaletteProps {
  className?: string;
}

const HUES: Array<[string, string]> = [
  ['--suite-indigo', 'Indigo — primary / Synthograsizer'],
  ['--suite-indigo-2', 'Indigo 2 — hover / links'],
  ['--suite-teal', 'Teal — Glitcher & Videorama accent'],
  ['--suite-fuchsia', 'Fuchsia — Taste Profile accent'],
  ['--suite-amber', 'Amber'],
  ['--suite-rose', 'Rose'],
  ['--suite-green', 'Green — success'],
  ['--suite-red', 'Red — danger'],
];

const RAMP: Array<[string, string]> = [
  ['--suite-bg', 'bg — page'],
  ['--suite-bg-2', 'bg-2'],
  ['--suite-bg-3', 'bg-3'],
  ['--suite-bg-4', 'bg-4'],
  ['--suite-bg-5', 'bg-5 — lifted panel'],
  ['--suite-bg-hover', 'bg-hover'],
];

const TEXT: Array<[string, string]> = [
  ['--suite-text', 'text'],
  ['--suite-text-mute', 'text-mute'],
  ['--suite-text-dim', 'text-dim'],
];

const swatchStyle = (token: string): CSSProperties => ({
  background: `var(${token})`,
  height: 44,
  borderRadius: 8,
  border: '1px solid var(--suite-border)',
});

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: 10,
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--suite-text-mute)',
  marginTop: 4,
  fontFamily: 'var(--suite-font-mono)',
};

const headingStyle: CSSProperties = {
  fontSize: 12,
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: 'var(--suite-text-dim)',
  margin: '18px 0 8px',
};

function Section({ title, tokens }: { title: string; tokens: Array<[string, string]> }) {
  return (
    <>
      <div style={headingStyle}>{title}</div>
      <div style={gridStyle}>
        {tokens.map(([token, note]) => (
          <div key={token}>
            <div style={swatchStyle(token)} />
            <div style={labelStyle}>
              {token}
              <br />
              <span style={{ color: 'var(--suite-text-dim)' }}>{note}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Foundation reference: the suite's canonical `--suite-*` palette — brand
 * hues with their per-tool assignments, the dark elevation ramp, and the
 * text hierarchy. Every swatch renders from the live CSS variables.
 */
export function ColorPalette({ className }: ColorPaletteProps) {
  return (
    <div className={className} style={{ color: 'var(--suite-text)' }}>
      <Section title="Brand hues" tokens={HUES} />
      <Section title="Elevation ramp" tokens={RAMP} />
      <Section title="Text" tokens={TEXT} />
    </div>
  );
}
