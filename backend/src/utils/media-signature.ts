export type DetectedMedia = { kind: 'image' | 'video'; mimeType: string; extension: string };

/**
 * Identifies supported media from its first bytes. The declared Content-Type
 * of an upload or download is never trusted on its own.
 * Keep in sync with `detectMedia` in src/cli/instacommand.ts (the CLI must stay dependency-free).
 */
export function detectMediaSignature(head: Buffer): DetectedMedia | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { kind: 'image', mimeType: 'image/jpeg', extension: '.jpg' };
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: 'image', mimeType: 'image/png', extension: '.png' };
  if (head.length >= 6 && ['GIF87a', 'GIF89a'].includes(head.subarray(0, 6).toString('latin1'))) return { kind: 'image', mimeType: 'image/gif', extension: '.gif' };
  if (head.length >= 12 && head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return { kind: 'image', mimeType: 'image/webp', extension: '.webp' };
  if (head.length >= 12 && head.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = head.subarray(8, 12).toString('latin1');
    // HEIC/AVIF share the ISO container but are not accepted by Meta's publishing APIs.
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'avif', 'avis'].includes(brand)) return null;
    if (brand === 'qt  ') return { kind: 'video', mimeType: 'video/quicktime', extension: '.mov' };
    return { kind: 'video', mimeType: 'video/mp4', extension: '.mp4' };
  }
  return null;
}

export const SUPPORTED_MEDIA_DESCRIPTION = 'JPG, PNG, WebP, GIF, MP4 ou MOV';
