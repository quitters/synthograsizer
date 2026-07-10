/* Build for the claude.ai/design sync (not app runtime):
     1. tsc → dist/*.js + *.d.ts
     2. dist/component-styles.css — the suite's real stylesheets, VERBATIM
        (tokens first so the custom properties are defined, then the Videorama
        component vocabulary). This file becomes _ds_bundle.css; the converter's
        styles.css @imports it, so designs receive the whole closure. static/
        stays the single source of truth — nothing here is rewritten.
     3. fonts/files/*.woff2 — self-hosted latin subsets for the three suite
        families, copied from the @fontsource dev deps so rendered designs never
        depend on the Google Fonts CDN. Pairs with the committed fonts/fonts.css. */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');

execSync('npx tsc -p tsconfig.json', { stdio: 'inherit', cwd: here });

// Verbatim suite CSS (tokens + Videorama vocabulary), then the DS's own
// light-first theme layer appended LAST so its :root wins (see src/theme.css).
const cssParts = [
  'static/shared/css/tokens.css',
  'static/videorama/css/videorama.css',
];
mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(
  join(here, 'dist', 'component-styles.css'),
  cssParts
    .map((p) => `/* ═══ from ${p} (verbatim) ═══ */\n` + readFileSync(join(repo, p), 'utf8'))
    .join('\n') +
    `\n/* ═══ design-system light-first theme layer (src/theme.css) ═══ */\n` +
    readFileSync(join(here, 'src', 'theme.css'), 'utf8'),
);

// Self-host the latin subsets the shipped @font-face (fonts/fonts.css) declares.
const FONTS = {
  '@fontsource/inter': ['inter-latin-400-normal', 'inter-latin-500-normal', 'inter-latin-600-normal', 'inter-latin-700-normal'],
  '@fontsource/space-grotesk': ['space-grotesk-latin-400-normal', 'space-grotesk-latin-500-normal', 'space-grotesk-latin-600-normal', 'space-grotesk-latin-700-normal'],
  '@fontsource/jetbrains-mono': ['jetbrains-mono-latin-400-normal', 'jetbrains-mono-latin-500-normal'],
};
const filesOut = join(here, 'fonts', 'files');
mkdirSync(filesOut, { recursive: true });
let n = 0;
for (const [pkg, names] of Object.entries(FONTS)) {
  for (const name of names) {
    copyFileSync(
      join(here, 'node_modules', pkg, 'files', `${name}.woff2`),
      join(filesOut, `${name}.woff2`),
    );
    n++;
  }
}

console.log(`built dist/ (js + d.ts + component-styles.css) and self-hosted ${n} woff2 files`);
