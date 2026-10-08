/**
 * Publishing: the company proposes, a person approves, nothing goes out on its own.
 * ─────────────────────────────────────────────────────────────────────────────────
 * Anything that leaves a room (an export, shared media, the Commons) goes through this queue. An agent can OFFER work
 * (the propose_publish tool); the owner can offer it too; neither can approve it. What the queue guarantees:
 *
 *   SNAPSHOT   a proposal copies the work at that moment, with a hash. What the screen reviewed, what the person approves and
 *              what is exported are the same bytes: editing the artifact in the room afterwards changes nothing here.
 *   SCREEN     the independent screen reviews every proposal at the PUBLISHING stage (the hard limits, the publishing floor, the
 *              audience the mandate sets). A "block" is final for that content: it cannot be approved and cannot be re-screened
 *              until it passes (a reviewer asked again and again is a coin tossed until it lands). Revise the work and propose it
 *              again. A screen that could not run leaves the proposal "unavailable", which also cannot be approved.
 *   APPROVAL   only the company's owner can approve, through the API. No agent tool reaches it. Approval is bound to the hash.
 *   SUPERSEDE  a new proposal of the same file from the same room replaces the earlier ones that are still waiting (status "superseded", never
 *              decided by a person). In the pilot three drafts of one engine used the whole queue, and only the last one meant anything.
 *   LABEL      every export says it is AI-generated, in a manifest and in the work itself where its format has room for a line.
 */
import fs from 'node:fs';
import path from 'node:path';
import { newId, isId, sha256 } from './util.js';
import { PolicyError } from './errors.js';
import { assertNoSecrets } from './secrets.js';
import { describeFindings } from './screen.js';
import { effectivePolicy } from './store.js';
import { SCHEMAS, validate } from './schema.js';
import { safeName } from '../services/sessionArchive.js';

export const AI_LABEL = 'AI-generated';
export const MAX_TEXT_CHARS = 100_000;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ITEM_RE = /^[a-f0-9]{16}$/;
const WAITING = new Set(['pending', 'unavailable']);

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'work';
const extOf = (mime) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[mime] || 'bin');

/** The label as a line the work itself can carry, in a form its format allows (null when it has no room for one, e.g. JSON). */
function labelLine(filename, dateIso, company) {
  const text = `${AI_LABEL}: made by an AI agent company (${company}) and approved by a person on ${dateIso.slice(0, 10)}.`;
  const ext = path.extname(filename).toLowerCase();
  if (['.html', '.htm', '.svg', '.xml'].includes(ext)) return { where: 'top', text: `<!-- ${text} -->` };
  if (['.js', '.mjs', '.css', '.ts'].includes(ext)) return { where: 'top', text: `/* ${text} */` };
  if (['.md', '.txt', ''].includes(ext)) return { where: 'bottom', text: `\n\n---\n${text}\n` };
  if (['.py', '.sh', '.rb', '.yaml', '.yml'].includes(ext)) return { where: 'top', text: `# ${text}` };
  return null;
}

export class PublishQueue {
  /**
   * @param {{ rootDir: string, store: import('./store.js').CompanyStore, operator: object, screen: import('./screen.js').Screen, audit: import('./audit.js').AuditLog, now?: () => Date }} options
   */
  constructor({ rootDir, store, operator, screen, audit, now = () => new Date() }) {
    this.rootDir = rootDir;
    this.store = store;
    this.operator = operator;
    this.screen = screen;
    this.audit = audit;
    this.now = now;
  }

  _dir(companyId, itemId) {
    if (!isId(companyId)) throw new PolicyError('No such company.', { status: 404, code: 'no_company' });
    if (itemId !== undefined && !ITEM_RE.test(String(itemId))) throw new PolicyError('No such proposal.', { status: 404, code: 'no_proposal' });
    return itemId === undefined
      ? path.join(this.rootDir, 'companies', companyId, 'publish')
      : path.join(this.rootDir, 'companies', companyId, 'publish', itemId);
  }

  _read(companyId, itemId) {
    try {
      return JSON.parse(fs.readFileSync(path.join(this._dir(companyId, itemId), 'item.json'), 'utf8'));
    } catch (err) {
      if (err instanceof PolicyError) throw err;
      throw new PolicyError('No such proposal.', { status: 404, code: 'no_proposal' });
    }
  }

  _write(item) { writeJsonAtomic(path.join(this._dir(item.companyId, item.id), 'item.json'), item); }

  _content(item) { return fs.readFileSync(path.join(this._dir(item.companyId, item.id), item.content.file)); }

  _verify(item) {
    const bytes = this._content(item);
    if (sha256(bytes) !== item.content.sha256) {
      throw new PolicyError('The stored copy of this work does not match what was reviewed, so it cannot be approved or exported.', { status: 409, code: 'content_changed' });
    }
    return bytes;
  }

  _log(item, type, extra = {}) {
    try {
      this.audit?.append(item.companyId, { type, proposal: item.id, kind: item.kind, title: item.title, by: item.by, ...extra });
    } catch (err) {
      console.warn(`[publish] could not write the audit log: ${err.message}`);
    }
  }

  /** What is safe to show in a list: everything but the work itself. */
  summary(item) {
    return {
      id: item.id, kind: item.kind, title: item.title, note: item.note || '', by: item.by, roomId: item.roomId, status: item.status,
      createdAt: item.createdAt, decidedAt: item.decidedAt || null, decidedBy: item.decidedBy || null, rejectedBecause: item.rejectedBecause || null,
      supersededBy: item.supersededBy || null,
      filename: item.filename || null, bytes: item.content.bytes, sha256: item.content.sha256,
      screen: item.screen ? { verdict: item.screen.verdict, findings: item.screen.findings, stage: 'publishing', model: item.screen.model || null, at: item.screen.at } : null,
      label: AI_LABEL,
    };
  }

  // ── proposing ──────────────────────────────────────────────────────────────

  /**
   * Offer work for publication.
   * @param {string} companyId
   * @param {{ kind: string, title: string, ref?: string, text?: string, note?: string, roomId?: string, by?: string }} proposal
   * @param {{ artifact?: (name: string) => object|null, media?: (id: string) => object|null }} [sources]  where artifacts and pictures come from (a room)
   */
  async propose(companyId, proposal, sources = {}) {
    const company = this.store.get(companyId);
    if (!company) throw new PolicyError('No such company.', { status: 404, code: 'no_company' });
    const { by = 'owner', ...given } = proposal;
    // (a field that is present but undefined is a field that was not given)
    const body = Object.fromEntries(Object.entries(given).filter(([, v]) => v !== undefined));
    const errors = validate(SCHEMAS.proposal, body);
    if (errors.length) throw new PolicyError(errors.join('; '), { status: 400, code: 'bad_proposal' });

    const eff = effectivePolicy(company, this.operator);
    const waitingItems = this.list(companyId).filter(i => WAITING.has(i.status));
    // An earlier offer of the same file from the same room that is still waiting is replaced by this one, so it does not count against the cap
    const replaced = body.kind === 'artifact' && body.roomId && body.ref
      ? waitingItems.filter(i => i.kind === 'artifact' && i.roomId === body.roomId && i.filename === safeName(body.ref, 'work.txt'))
      : [];
    const waiting = waitingItems.length - replaced.length;
    if (waiting >= eff.ceilings.maxPendingProposals) {
      throw new PolicyError(`${waitingItems.length} proposals are already waiting for a person; the limit is ${eff.ceilings.maxPendingProposals}. Review some first.`, { status: 403, code: 'proposal_cap' });
    }

    assertNoSecrets(body.title, 'The title', 'title');
    if (body.note) assertNoSecrets(body.note, 'The note', 'note');

    // 1. Snapshot the work
    let bytes;
    let mimeType = 'text/plain';
    let filename = null;
    let prompt = null;
    if (body.kind === 'text') {
      if (typeof body.text !== 'string' || !body.text.trim()) throw new PolicyError('A text proposal needs the text.', { status: 400, code: 'bad_proposal', field: 'text' });
      if (body.text.length > MAX_TEXT_CHARS) throw new PolicyError(`The text is too long (${body.text.length} characters; the limit is ${MAX_TEXT_CHARS}).`, { status: 400, code: 'bad_proposal', field: 'text' });
      assertNoSecrets(body.text, 'The text', 'text');
      bytes = Buffer.from(body.text, 'utf8');
    } else if (body.kind === 'artifact') {
      const artifact = body.ref && sources.artifact ? sources.artifact(body.ref) : null;
      if (!artifact) throw new PolicyError(`There is no file called "${String(body.ref || '').slice(0, 80)}" in that room.`, { status: 404, code: 'no_such_work', field: 'ref' });
      if (artifact.content.length > MAX_TEXT_CHARS) throw new PolicyError('That file is too long to publish in one piece.', { status: 400, code: 'bad_proposal' });
      assertNoSecrets(artifact.content, 'The file', 'ref');
      bytes = Buffer.from(artifact.content, 'utf8');
      filename = safeName(artifact.filename, 'work.txt');
    } else {
      const media = body.ref && sources.media ? sources.media(body.ref) : null;
      if (!media || media.type !== 'image' || !media.data) throw new PolicyError('There is no picture with that id in that room.', { status: 404, code: 'no_such_work', field: 'ref' });
      bytes = Buffer.from(media.data, 'base64');
      if (bytes.length > MAX_IMAGE_BYTES) throw new PolicyError('That picture is too large to publish.', { status: 400, code: 'bad_proposal' });
      mimeType = media.mimeType || 'image/png';
      prompt = typeof media.prompt === 'string' ? media.prompt : null;
    }

    const id = newId().slice(0, 16);
    const item = {
      id, companyId, roomId: body.roomId || null, kind: body.kind, title: body.title.trim(), note: body.note || '', by,
      status: 'pending', createdAt: this.now().toISOString(), filename, prompt, mimeType,
      content: { file: body.kind === 'image' ? `content.${extOf(mimeType)}` : 'content.txt', bytes: bytes.length, sha256: sha256(bytes) },
      screen: null,
    };
    fs.mkdirSync(this._dir(companyId, id), { recursive: true });
    fs.writeFileSync(path.join(this._dir(companyId, id), item.content.file), bytes);

    // 2. The independent screen, at the publishing stage
    await this._screen(item, bytes);
    this._write(item);
    this._log(item, 'publish_proposed', { status: item.status, rules: item.screen.findings.map(f => f.rule), verdict: item.screen.verdict });
    // A newer version that the screen blocked does not retire the older one: the older stays a screened, reviewable snapshot until a person decides
    const superseded = [];
    if (item.status !== 'blocked') {
      for (const old of replaced) {
        try {
          const earlier = this._read(companyId, old.id);
          if (!WAITING.has(earlier.status)) continue;
          earlier.status = 'superseded';
          earlier.supersededBy = item.id;
          earlier.decidedAt = this.now().toISOString();
          earlier.decidedBy = 'system';
          this._write(earlier);
          this._log(earlier, 'publish_superseded', { by: item.id });
          superseded.push(earlier.id);
        } catch (err) {
          console.warn(`[publish] could not retire ${old.id}: ${err.message}`);
        }
      }
    }
    return { ...this.summary(item), superseded };
  }

  async _screen(item, bytes) {
    const company = this.store.get(item.companyId);
    const mandate = effectivePolicy(company, this.operator).mandate;
    const parts = [{ type: 'text', label: 'the title and note', text: `Title: ${item.title}${item.note ? `\nNote: ${item.note}` : ''}` }];
    if (item.kind === 'image') {
      parts.push({ type: 'image', data: bytes.toString('base64'), mimeType: item.mimeType });
      if (item.prompt) parts.push({ type: 'text', label: 'the prompt used to make the picture', text: item.prompt });
    } else {
      parts.push({ type: 'text', label: item.filename ? `the file ${item.filename}` : 'the text', text: bytes.toString('utf8') });
    }
    const result = await this.screen.check({ stage: 'publishing', mandate, parts });
    item.screen = { verdict: result.verdict, findings: result.findings, model: result.model || null, error: result.error || null, at: this.now().toISOString() };
    item.status = result.verdict === 'pass' ? 'pending' : result.verdict === 'block' ? 'blocked' : 'unavailable';
    return result;
  }

  // ── reading ────────────────────────────────────────────────────────────────

  list(companyId, { status = null } = {}) {
    let names = [];
    try { names = fs.readdirSync(this._dir(companyId)); } catch { return []; }
    const items = [];
    for (const name of names) {
      if (!ITEM_RE.test(name)) continue;
      try { items.push(this._read(companyId, name)); } catch { /* an unreadable folder is skipped */ }
    }
    return items
      .filter(i => !status || i.status === status)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(i => this.summary(i));
  }

  /** The proposal and the work itself, for the person deciding. */
  get(companyId, itemId) {
    const item = this._read(companyId, itemId);
    const bytes = this._content(item);
    const content = item.kind === 'image'
      ? { encoding: 'base64', mimeType: item.mimeType, data: bytes.toString('base64') }
      : { encoding: 'utf8', mimeType: item.mimeType, data: bytes.toString('utf8') };
    return { ...this.summary(item), prompt: item.prompt, content };
  }

  // ── deciding ───────────────────────────────────────────────────────────────

  /** Review again. Allowed for a proposal waiting for a person or one the screen could not review; a block is final. */
  async rescreen(companyId, itemId) {
    const item = this._read(companyId, itemId);
    if (item.status === 'blocked') {
      throw new PolicyError('The safety screen blocked this work and a block is final for it. Revise the work and propose it again; it is not reviewed again until it changes.', { status: 409, code: 'block_is_final' });
    }
    if (!WAITING.has(item.status)) throw new PolicyError(`This proposal is ${item.status}; it cannot be reviewed again.`, { status: 409, code: 'not_waiting' });
    const before = item.status;
    const bytes = this._verify(item);
    const previous = item.screen;
    await this._screen(item, bytes);
    // A proposal that was waiting for a person only ever gets stricter: a screen that cannot run now does not undo an earlier pass.
    if (before === 'pending' && item.screen.verdict === 'unavailable') { item.screen = previous; item.status = 'pending'; }
    this._write(item);
    this._log(item, 'publish_rescreened', { from: before, status: item.status, rules: (item.screen?.findings || []).map(f => f.rule) });
    return this.summary(item);
  }

  /** The owner approves. Only a proposal the screen passed can be approved, and only the stored, reviewed bytes. */
  approve(companyId, itemId) {
    const item = this._read(companyId, itemId);
    if (item.status === 'blocked') {
      throw new PolicyError(`The safety screen blocked this work (${describeFindings(item.screen.findings)}), so it cannot be approved. Revise it and propose it again.`, { status: 409, code: 'blocked' });
    }
    if (item.status === 'unavailable') {
      throw new PolicyError('The safety screen could not review this work, so it cannot be approved yet. Review it again first.', { status: 409, code: 'unreviewed' });
    }
    if (item.status !== 'pending') throw new PolicyError(`This proposal is already ${item.status}.`, { status: 409, code: 'already_decided' });
    this._verify(item);
    item.status = 'approved';
    item.decidedAt = this.now().toISOString();
    item.decidedBy = 'owner';
    this._write(item);
    this._log(item, 'publish_approved', { sha256: item.content.sha256 });
    return this.summary(item);
  }

  reject(companyId, itemId, reason = '') {
    const item = this._read(companyId, itemId);
    if (!['pending', 'unavailable', 'blocked'].includes(item.status)) throw new PolicyError(`This proposal is already ${item.status}.`, { status: 409, code: 'already_decided' });
    item.status = 'rejected';
    item.decidedAt = this.now().toISOString();
    item.decidedBy = 'owner';
    item.rejectedBecause = String(reason || '').slice(0, 300) || null;
    this._write(item);
    this._log(item, 'publish_rejected', { because: item.rejectedBecause });
    return this.summary(item);
  }

  // ── leaving the room ───────────────────────────────────────────────────────

  /**
   * The approved work with its label, ready to take away: { manifest, files: [{ name, mimeType, encoding, data }] }.
   * Only an approved proposal can be exported, and only if the stored bytes still match what was reviewed.
   */
  exportBundle(companyId, itemId) {
    const item = this._read(companyId, itemId);
    if (item.status !== 'approved') throw new PolicyError('Only work a person has approved can be exported.', { status: 409, code: 'not_approved' });
    const bytes = this._verify(item);
    const company = this.store.get(companyId);
    const approvedAt = item.decidedAt;
    const base = slug(item.title);
    const files = [];

    if (item.kind === 'image') {
      files.push({ name: `${base}.${extOf(item.mimeType)}`, mimeType: item.mimeType, encoding: 'base64', data: bytes.toString('base64') });
    } else {
      const name = item.filename || `${base}.txt`;
      let text = bytes.toString('utf8');
      const line = labelLine(name, approvedAt, company?.name || 'an AI agent company');
      if (line) text = line.where === 'top' ? `${line.text}\n${text}` : `${text}${line.text}`;
      files.push({ name, mimeType: item.mimeType === 'text/plain' ? 'text/plain; charset=utf-8' : item.mimeType, encoding: 'utf8', data: text });
    }

    const manifest = {
      label: AI_LABEL,
      aiGenerated: true,
      title: item.title,
      kind: item.kind,
      company: company?.name || null,
      madeBy: 'AI agents',
      proposedBy: item.by,
      approvedBy: 'a person (the company owner)',
      approvedAt,
      sha256: item.content.sha256,
      screen: { verdict: item.screen?.verdict, stage: 'publishing', checkedAt: item.screen?.at },
      note: 'This work was made by AI agents and reviewed and approved by a person before it left the room. It does not depict real people or events unless it says so.',
    };
    files.push({ name: 'AI-GENERATED.txt', mimeType: 'text/plain; charset=utf-8', encoding: 'utf8', data: `${AI_LABEL}\n\n${manifest.note}\nTitle: ${item.title}\nApproved: ${approvedAt}\n` });
    files.push({ name: 'manifest.json', mimeType: 'application/json', encoding: 'utf8', data: JSON.stringify(manifest, null, 2) });
    this._log(item, 'publish_exported', { files: files.length });
    return { manifest, files };
  }
}
