/**
 * Hide agent control tags from the live token stream.
 *
 * Agents act by writing tags into their reply -- [GENERATE_IMAGE: ...],
 * [COMPOSE_FROM: <id> | ...], [SEARCH: ...], [ARTIFACT: file] ... [/ARTIFACT] and
 * so on. The orchestrator parses and strips them once the turn is complete, but
 * the chunks are broadcast as they arrive, so the browser used to show the raw
 * tag (ids, prompts, whole files of code) until the finished message replaced
 * the stream.
 *
 * This filter sits between the model and the `chunk` broadcast only. The
 * orchestrator keeps accumulating the unfiltered text, so tag handling is
 * untouched. Text that merely looks like a tag ("[Note: ...]", "[1]") is
 * released as soon as it is clear it is not one.
 *
 *   const f = createStreamTagFilter();
 *   const visible = f.push(chunkText);   // '' while a tag is still open
 */

// Every tag name the parsers in imageGen.js / tools.js / orchestrator.js act on.
export const STREAM_TAG_NAMES = [
  'GENERATE_IMAGE', 'REMIX', 'ITERATE', 'COMPOSE_FROM',
  'SEARCH', 'WEB_SEARCH', 'ANALYZE_URL', 'URL', 'READ_URL', 'RESEARCH', 'DEEP_SEARCH',
  'SYNTH_IMAGE', 'SYNTH_VIDEO', 'SYNTH_TEMPLATE', 'SYNTH_STORY', 'SYNTH_REMIX_TEMPLATE',
  'SYNTH_NARRATIVE', 'SYNTH_TRANSFORM', 'SYNTH_ANALYZE', 'SYNTH_STYLE',
  'WORKFLOW_TEMPLATE', 'WORKFLOW',
  'ARTIFACT',
  'CRITIC', 'RENDER',
];

// A tag that never closes (an unbalanced "[") must not swallow the rest of the
// reply: past this many characters it is released as ordinary text. Artifact
// bodies are exempt -- they are legitimately long.
const MAX_OPEN_TAG_CHARS = 6000;
const ARTIFACT_CLOSE = '[/artifact]';

/** 'tag' | 'not-tag' | 'wait' for text that starts with "[". */
function classify(s) {
  const m = /^\[([A-Za-z_]*)/.exec(s);
  const name = m[1].toUpperCase();
  const rest = s.slice(1 + m[1].length);
  if (rest === '') {
    // Still typing the name: keep holding only while it could become a tag.
    return name === '' || STREAM_TAG_NAMES.some(n => n.startsWith(name)) ? 'wait' : 'not-tag';
  }
  return rest[0] === ':' && STREAM_TAG_NAMES.includes(name) ? 'tag' : 'not-tag';
}

export function createStreamTagFilter() {
  let pending = '';
  let mode = 'text';          // 'text' | 'tag' | 'artifact'
  let depth = 0;
  let scan = 0;
  let isArtifact = false;

  function push(chunk) {
    pending += chunk;
    let out = '';
    for (;;) {
      if (mode === 'text') {
        const i = pending.indexOf('[');
        if (i < 0) { out += pending; pending = ''; break; }
        out += pending.slice(0, i);
        pending = pending.slice(i);
        const verdict = classify(pending);
        if (verdict === 'wait') break;
        if (verdict === 'not-tag') { out += '['; pending = pending.slice(1); continue; }
        isArtifact = /^\[artifact:/i.test(pending);
        mode = 'tag'; depth = 0; scan = 0;
      }
      if (mode === 'tag') {
        let closed = false;
        for (; scan < pending.length; scan++) {
          const c = pending[scan];
          if (c === '[') depth++;
          else if (c === ']' && --depth === 0) { scan++; closed = true; break; }
        }
        if (!closed) {
          if (!isArtifact && pending.length > MAX_OPEN_TAG_CHARS) {
            out += pending; pending = ''; mode = 'text';
          }
          break;
        }
        pending = pending.slice(scan); scan = 0;
        mode = isArtifact ? 'artifact' : 'text';
        continue;
      }
      // mode === 'artifact': swallow the body up to [/ARTIFACT]
      const j = pending.toLowerCase().indexOf(ARTIFACT_CLOSE);
      if (j < 0) { pending = pending.slice(-(ARTIFACT_CLOSE.length - 1)); break; }
      pending = pending.slice(j + ARTIFACT_CLOSE.length);
      mode = 'text';
    }
    return out;
  }

  // At the end of a stream, text held back only because it *might* have become a tag
  // (a lone "[", "[SEA") is ordinary text after all. An open tag or artifact stays hidden.
  function flush() {
    const rest = mode === 'text' ? pending : '';
    pending = '';
    mode = 'text';
    return rest;
  }

  return { push, flush };
}
