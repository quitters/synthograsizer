import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { MediaStore } from '../services/mediaStore.js';
import { ArtifactStore } from '../services/artifactStore.js';
import { makeServices, markerClassifier } from './testKit.js';
import { newId, sha256 } from './util.js';
import { readImageLabel, DIGITAL_SOURCE_TYPE } from './imageLabel.js';

/** What an exported picture carries: the label inside its own file, the pixels the ones a person approved, and a manifest that says which. */

const cleanups = [];
afterEach(() => { while (cleanups.length) cleanups.pop()(); });

function setup() {
  const { services, cleanup } = makeServices({ classify: markerClassifier({}) });
  cleanups.push(cleanup);
  const company = services.store.create(newId(), { name: 'Tide Pool Studio & Co', departments: ['Desk'] });
  const media = new MediaStore();
  const artifacts = new ArtifactStore();
  return { services, company, media, artifacts, queue: services.publish, sources: { artifact: (n) => artifacts.get(n) || null, media: (id) => media.get(id) || null } };
}

async function exportOf(ctx, { id, data, mimeType }) {
  ctx.media.add({ id, type: 'image', data: data.toString('base64'), mimeType, prompt: 'a calm tide pool at dawn' });
  const item = await ctx.queue.propose(ctx.company.id, { kind: 'image', title: 'Tide pool', ref: id, by: 'Ann Test' }, ctx.sources);
  ctx.queue.approve(ctx.company.id, item.id);
  return ctx.queue.exportBundle(ctx.company.id, item.id);
}

const raw = { width: 20, height: 12, channels: 3 };
const pixelsOf = async (buf) => (await sharp(buf).raw().toBuffer());

test('an exported PNG carries the label in its own file, with the pixels that were approved, and the manifest says so', async () => {
  const ctx = setup();
  const original = await sharp(Buffer.alloc(20 * 12 * 3, 90), { raw }).png().toBuffer();
  const out = await exportOf(ctx, { id: 'p1', data: original, mimeType: 'image/png' });

  const file = out.files[0];
  assert.equal(file.name, 'tide-pool.png');
  const bytes = Buffer.from(file.data, 'base64');
  const label = readImageLabel(bytes);
  assert.match(label.description, /^AI-generated: made by an AI agent company \(Tide Pool Studio & Co\) and approved by a person on \d{4}-\d\d-\d\d\.$/);
  assert.equal(label.digitalSourceType, DIGITAL_SOURCE_TYPE);
  assert.ok((await pixelsOf(bytes)).equals(await pixelsOf(original)), 'the picture itself is the one that was approved');

  assert.equal(out.manifest.labelInFile, 'png-xmp');
  assert.equal(out.manifest.sha256, sha256(original), 'the manifest still names the approved bytes');
  assert.equal(out.manifest.fileSha256, sha256(bytes), 'and the exported file, which differs by the label');
  assert.notEqual(out.manifest.fileSha256, out.manifest.sha256);
  assert.deepEqual(JSON.parse(out.files.at(-1).data), out.manifest);
  assert.ok(out.files.some(f => f.name === 'AI-GENERATED.txt'), 'the note beside it stays');
});

test('an exported JPEG carries the label too', async () => {
  const ctx = setup();
  const original = await sharp(Buffer.alloc(20 * 12 * 3, 160), { raw }).jpeg().toBuffer();
  const out = await exportOf(ctx, { id: 'j1', data: original, mimeType: 'image/jpeg' });
  assert.equal(out.manifest.labelInFile, 'jpeg-xmp');
  const bytes = Buffer.from(out.files[0].data, 'base64');
  assert.equal(readImageLabel(bytes).digitalSourceType, DIGITAL_SOURCE_TYPE);
  assert.ok((await pixelsOf(bytes)).equals(await pixelsOf(original)));
});

test('a format with no room for it is exported as it was, and the manifest says the label is not in the file', async () => {
  const ctx = setup();
  const webp = await sharp(Buffer.alloc(20 * 12 * 3, 40), { raw }).webp().toBuffer();
  const out = await exportOf(ctx, { id: 'w1', data: webp, mimeType: 'image/webp' });
  assert.equal(out.manifest.labelInFile, null);
  assert.equal(out.files[0].data, webp.toString('base64'));
  assert.equal(out.manifest.fileSha256, out.manifest.sha256);
  assert.equal(out.manifest.label, 'AI-generated', 'the manifest and the note still carry it');
});

test('text exports say where the label is in the file too', async () => {
  const ctx = setup();
  ctx.artifacts.save('poster.html', '<!doctype html><h1>Tide pools</h1>');
  ctx.artifacts.save('engine.json', '{"promptTemplate":"x","variables":[]}');
  const bundle = async (ref) => {
    const item = await ctx.queue.propose(ctx.company.id, { kind: 'artifact', title: ref, ref, by: 'Ann Test' }, ctx.sources);
    ctx.queue.approve(ctx.company.id, item.id);
    return ctx.queue.exportBundle(ctx.company.id, item.id);
  };
  const html = await bundle('poster.html');
  assert.equal(html.manifest.labelInFile, 'text-line');
  assert.equal(html.manifest.fileSha256, sha256(Buffer.from(html.files[0].data, 'utf8')));
  const json = await bundle('engine.json');
  assert.equal(json.manifest.labelInFile, null);
  assert.equal(json.manifest.fileSha256, json.manifest.sha256);
});
