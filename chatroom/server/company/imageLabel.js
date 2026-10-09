/**
 * The AI-generated label, inside the picture's own file.
 * ──────────────────────────────────────────────────────
 * An export used to say "AI-generated" in a manifest and a note beside the work, and inside the files that have room for a line
 * (HTML, scripts, text), but not inside a PNG or a JPEG: copy the picture out of its folder and the label stayed behind. This writes it into
 * the file as metadata, in the form image tools and platforms read: an XMP packet whose `Iptc4xmpExt:DigitalSourceType` is
 * `trainedAlgorithmicMedia` (the IPTC value for "made by a generative model") and a description, plus a plain text chunk or comment for
 * viewers that show only those.
 *
 * Nothing is decoded and nothing is re-compressed: the picture's own bytes are copied across untouched and the metadata is inserted beside
 * them, so the pixels are exactly the ones the screen reviewed and a person approved. A format with no room for it here (WebP, GIF), or
 * bytes that are not the image they claim to be, are returned as they were, and the manifest says the label is not in the file.
 */

const XMP_PNG_KEYWORD = 'XML:com.adobe.xmp';
const XMP_JPEG_HEADER = Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1');
export const DIGITAL_SOURCE_TYPE = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_DESCRIPTION_CHARS = 400;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const escapeXml = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
/**
 * Text that goes into a metadata field: no control characters, no angle brackets (a viewer that shows a text chunk as markup must not be handed
 * any), a sane length. The XMP packet escapes the rest.
 */
const clean = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPTION_CHARS);

/** The XMP packet: a description and the IPTC digital-source value for AI-generated media. */
export function buildXmp(description) {
  const bom = String.fromCodePoint(0xfeff);
  return Buffer.from(
    `<?xpacket begin="${bom}" id="W5M0MpCehiHzreSzNTczkc9d"?>\n`
    + '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n'
    + ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
    + '  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">\n'
    + `   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(description)}</rdf:li></rdf:Alt></dc:description>\n`
    + `   <Iptc4xmpExt:DigitalSourceType>${DIGITAL_SOURCE_TYPE}</Iptc4xmpExt:DigitalSourceType>\n`
    + '  </rdf:Description>\n'
    + ' </rdf:RDF>\n'
    + '</x:xmpmeta>\n'
    + '<?xpacket end="w"?>',
    'utf8',
  );
}

// ── PNG ─────────────────────────────────────────────────────────────────────

function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** An iTXt chunk (UTF-8, uncompressed): keyword, flags, empty language and translated keyword, the text. */
function itxt(keyword, text) {
  return pngChunk('iTXt', Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0, 0, 0, 0, 0]), Buffer.from(text, 'utf8')]));
}

function hasPngXmp(bytes) {
  return bytes.includes(Buffer.from(`iTXt${XMP_PNG_KEYWORD}\0`, 'latin1'));
}

function labelPng(bytes, description) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString('latin1', 12, 16) !== 'IHDR') return null;
  const ihdrEnd = 8 + 12 + bytes.readUInt32BE(8);                       // signature, then IHDR's length, type, data and CRC
  if (ihdrEnd > bytes.length) return null;
  const withXmp = !hasPngXmp(bytes);                                    // a second XMP packet would make the file invalid
  const added = Buffer.concat([itxt('Description', description), ...(withXmp ? [itxt(XMP_PNG_KEYWORD, buildXmp(description).toString('utf8'))] : [])]);
  return { bytes: Buffer.concat([bytes.subarray(0, ihdrEnd), added, bytes.subarray(ihdrEnd)]), format: withXmp ? 'png-xmp' : 'png-text' };
}

// ── JPEG ────────────────────────────────────────────────────────────────────

function jpegSegment(marker, payload) {
  const head = Buffer.alloc(4);
  head.writeUInt8(0xff, 0);
  head.writeUInt8(marker, 1);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

function labelJpeg(bytes, description) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  // JFIF wants its APP0 first: the new segments go after it
  let at = 2;
  if (bytes[2] === 0xff && bytes[3] === 0xe0) {
    const len = bytes.readUInt16BE(4);
    at = 4 + len;
    if (at > bytes.length) return null;
  }
  const xmp = buildXmp(description);
  const withXmp = !bytes.includes(XMP_JPEG_HEADER) && XMP_JPEG_HEADER.length + xmp.length + 2 <= 0xffff;
  const comment = Buffer.from(description.replace(/[^\x20-\x7e]/g, '?'), 'latin1');
  const added = Buffer.concat([...(withXmp ? [jpegSegment(0xe1, Buffer.concat([XMP_JPEG_HEADER, xmp]))] : []), jpegSegment(0xfe, comment)]);
  return { bytes: Buffer.concat([bytes.subarray(0, at), added, bytes.subarray(at)]), format: withXmp ? 'jpeg-xmp' : 'jpeg-comment' };
}

/**
 * Put the AI-generated label into an image's own file.
 * @param {Buffer} bytes
 * @param {string} mimeType
 * @param {string} description  one sentence, e.g. "AI-generated: made by an AI agent company (X) and approved by a person on 2026-10-09."
 * @returns {{ bytes: Buffer, format: 'png-xmp'|'png-text'|'jpeg-xmp'|'jpeg-comment' } | null}  null when the format has no room here or the bytes are not that image
 */
export function labelImage(bytes, mimeType, description) {
  const text = clean(description);
  if (!text || !Buffer.isBuffer(bytes)) return null;
  if (mimeType === 'image/png') return labelPng(bytes, text);
  if (mimeType === 'image/jpeg') return labelJpeg(bytes, text);
  return null;
}

/** What a reader of the file would find: the description and the digital-source value (null for each that is not there). For tests and checks. */
export function readImageLabel(bytes) {
  const text = bytes.toString('latin1');
  const utf = bytes.toString('utf8');
  const xmp = /<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/.exec(utf)?.[0] ?? null;
  const description = xmp ? (/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/.exec(xmp)?.[1] ?? null) : (/Description\0\0\0\0\0([^\0]+)/.exec(text)?.[1] ?? null);
  return {
    xmp: Boolean(xmp),
    description: description && description.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&'),
    digitalSourceType: xmp ? (/<Iptc4xmpExt:DigitalSourceType>([^<]*)</.exec(xmp)?.[1] ?? null) : null,
  };
}
