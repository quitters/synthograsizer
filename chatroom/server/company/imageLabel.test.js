import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { labelImage, readImageLabel, buildXmp, DIGITAL_SOURCE_TYPE } from './imageLabel.js';

/**
 * The AI-generated label written into a PNG or JPEG's own file: readable by an image tool, and the pixels exactly as they were.
 */

const SENTENCE = 'AI-generated: made by an AI agent company (Tide Pool Studio) and approved by a person on 2026-10-09.';

/** A small picture with something in it (a gradient), as a decoded raw buffer, so a pixel check means something. */
function raw(width = 24, height = 16) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.writeUIntBE(((x * 10) << 16) | ((y * 15) << 8) | ((x + y) * 5), (y * width + x) * 3, 3);
  return { data, info: { width, height, channels: 3 } };
}
const png = async () => { const r = raw(); return sharp(r.data, { raw: r.info }).png().toBuffer(); };
const jpeg = async () => { const r = raw(); return sharp(r.data, { raw: r.info }).jpeg({ quality: 90 }).toBuffer(); };
const pixels = async (buf) => (await sharp(buf).raw().toBuffer({ resolveWithObject: true }));

test('a PNG gets the label as XMP (IPTC digital-source type and a description) and a text chunk; the pixels are untouched and it still opens', async () => {
  const before = await png();
  const out = labelImage(before, 'image/png', SENTENCE);
  assert.equal(out.format, 'png-xmp');
  assert.ok(out.bytes.length > before.length);

  const read = readImageLabel(out.bytes);
  assert.equal(read.xmp, true);
  assert.equal(read.description, SENTENCE);
  assert.equal(read.digitalSourceType, DIGITAL_SOURCE_TYPE);
  assert.match(DIGITAL_SOURCE_TYPE, /trainedAlgorithmicMedia$/);

  const a = await pixels(before);
  const b = await pixels(out.bytes);
  assert.deepEqual(b.info, a.info);
  assert.ok(a.data.equals(b.data), 'every pixel is the same');
  // the original bytes are all still there, in order, around the inserted chunks
  assert.ok(out.bytes.subarray(0, 33).equals(before.subarray(0, 33)), 'signature and IHDR first');
  assert.ok(out.bytes.subarray(out.bytes.length - (before.length - 33)).equals(before.subarray(33)), 'then the rest of the file, untouched');
});

test('a PNG that already carries XMP is not given a second packet: it gets the text chunk only', async () => {
  const once = labelImage(await png(), 'image/png', SENTENCE);
  const twice = labelImage(once.bytes, 'image/png', SENTENCE);
  assert.equal(twice.format, 'png-text');
  assert.equal(twice.bytes.toString('latin1').split('XML:com.adobe.xmp').length - 1, 1, 'one XMP packet in the file');
  await pixels(twice.bytes);                                  // still decodes
});

test('a JPEG gets the label as an XMP segment and a comment, after its JFIF header; the pixels decode the same', async () => {
  const before = await jpeg();
  const out = labelImage(before, 'image/jpeg', SENTENCE);
  assert.equal(out.format, 'jpeg-xmp');
  assert.equal(out.bytes[0], 0xff);
  assert.equal(out.bytes[1], 0xd8);
  const read = readImageLabel(out.bytes);
  assert.equal(read.xmp, true);
  assert.equal(read.description, SENTENCE);
  assert.equal(read.digitalSourceType, DIGITAL_SOURCE_TYPE);
  assert.ok(out.bytes.toString('latin1').includes(SENTENCE), 'and the comment');

  const a = await pixels(before);
  const b = await pixels(out.bytes);
  assert.ok(a.data.equals(b.data), 'decoded pixels are identical: nothing was re-compressed');
  if (before[2] === 0xff && before[3] === 0xe0) {
    const app0 = 4 + before.readUInt16BE(4);
    assert.ok(out.bytes.subarray(0, app0).equals(before.subarray(0, app0)), 'the JFIF segment stays first');
  }
});

test('a JPEG with no JFIF segment is labelled right after the start marker', async () => {
  const before = await jpeg();
  // strip the APP0 segment if sharp wrote one, to make the bare case
  const app0 = before[3] === 0xe0 ? 4 + before.readUInt16BE(4) : 2;
  const bare = Buffer.concat([before.subarray(0, 2), before.subarray(app0)]);
  const out = labelImage(bare, 'image/jpeg', SENTENCE);
  assert.equal(out.format, 'jpeg-xmp');
  assert.equal(readImageLabel(out.bytes).description, SENTENCE);
  assert.ok((await pixels(out.bytes)).data.equals((await pixels(bare)).data));
});

test('a company name that could break the markup is escaped, and a name in any script survives in a PNG', async () => {
  const hostile = 'AI-generated: made by an AI agent company (A&B <script>"x"</script> \'y\' 東京 Zoë) and approved by a person on 2026-10-09.';
  const out = labelImage(await png(), 'image/png', hostile);
  const xmpText = out.bytes.toString('utf8');
  assert.ok(!xmpText.includes('<script>') && !xmpText.includes('</script>'), 'no markup got through, in the text chunk or the packet');
  const expected = hostile.replace(/[<>]/g, ' ').replace(/\s+/g, ' ');
  assert.equal(readImageLabel(out.bytes).description, expected, 'the name survives (escaped in the packet, plain in the chunk) with the brackets taken out');
  assert.ok(xmpText.includes('A&amp;B'), 'the ampersand is escaped in the packet');

  const jpg = labelImage(await jpeg(), 'image/jpeg', hostile);
  const latin = jpg.bytes.toString('latin1');
  assert.ok(!latin.includes('<script>'));
  assert.ok(latin.includes('A&amp;B'), 'escaped in the packet');
  assert.ok(latin.includes('A&B script "x" /script'), 'and the comment keeps printable ASCII only (the other scripts become ?)');
});

test('control characters are dropped and the description is capped', async () => {
  const out = labelImage(await png(), 'image/png', `AI-generated:\u0000\u0007\n\n${'x'.repeat(2000)}`);
  const d = readImageLabel(out.bytes).description;
  assert.ok(d.length <= 400);
  assert.ok(!/[\u0000-\u001f]/.test(d));
  assert.equal(labelImage(await png(), 'image/png', '   '), null, 'nothing to say, nothing written');
});

test('formats with no room here, and bytes that are not the image they claim, come back as null (the manifest then says so)', async () => {
  const r = raw();
  const webp = await sharp(r.data, { raw: r.info }).webp().toBuffer();
  assert.equal(labelImage(webp, 'image/webp', SENTENCE), null);
  assert.equal(labelImage(await sharp(r.data, { raw: r.info }).gif().toBuffer(), 'image/gif', SENTENCE), null);
  assert.equal(labelImage(Buffer.from('not really a png, but bytes all the same'), 'image/png', SENTENCE), null);
  assert.equal(labelImage(Buffer.from('not a jpeg'), 'image/jpeg', SENTENCE), null);
  assert.equal(labelImage(Buffer.alloc(0), 'image/png', SENTENCE), null);
  assert.equal(labelImage('a string', 'image/png', SENTENCE), null);
  assert.equal(labelImage(await png(), 'image/jpeg', SENTENCE), null, 'a PNG called a JPEG is not touched');
});

test('the XMP packet is well-formed enough for a reader: a packet wrapper and one description with the digital-source value', () => {
  const xmp = buildXmp('hello & goodbye').toString('utf8');
  assert.match(xmp, /^<\?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"\?>/);
  assert.match(xmp, /<\?xpacket end="w"\?>$/);
  assert.match(xmp, /<rdf:li xml:lang="x-default">hello &amp; goodbye<\/rdf:li>/);
  assert.equal(xmp.split('DigitalSourceType>').length - 1, 2, 'opened and closed once');
});
