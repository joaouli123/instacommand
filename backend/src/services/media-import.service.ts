import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { env } from '../config/env';
import { publicMediaBase, normalizeMediaUrl } from '../utils/public-media';
import { safeGet, UnsafeUrlError } from '../utils/safe-fetch';
import { detectMediaSignature, SUPPORTED_MEDIA_DESCRIPTION, type DetectedMedia } from '../utils/media-signature';
import { ValidationError } from '../utils/errors';

// Same ceiling as the multipart upload route.
export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
const DOWNLOAD_DEADLINE_MS = 5 * 60_000;

export type ImportedMedia = { sourceUrl: string; url: string; mimeType: string; kind: 'image' | 'video'; bytes: number; alreadyHosted: boolean };

const uploadRoot = () => path.resolve(process.cwd(), env.MEDIA_UPLOAD_DIR);
export const newUploadFilename = (extension: string) => `${Date.now()}-${crypto.randomUUID()}${extension}`;

/** URLs that already point at this server's public uploads are reused, not downloaded again. */
function alreadyHostedMedia(sourceUrl: string): ImportedMedia | null {
  const normalized = normalizeMediaUrl(sourceUrl);
  const base = `${publicMediaBase()}/`;
  if (!normalized.startsWith(base)) return null;
  const filename = decodeURIComponent(normalized.slice(base.length).split(/[?#]/)[0]);
  if (!/^[A-Za-z0-9._-]+$/.test(filename) || filename.startsWith('.')) return null;
  const filePath = path.join(uploadRoot(), filename);
  if (!fs.existsSync(filePath)) throw new ValidationError('Esta mídia do InstaCommand não existe mais. Envie o arquivo novamente.');
  const head = Buffer.alloc(16);
  const fd = fs.openSync(filePath, 'r');
  try { fs.readSync(fd, head, 0, 16, 0); } finally { fs.closeSync(fd); }
  const detected = detectMediaSignature(head);
  if (!detected) throw new ValidationError(`Formato não suportado. Use ${SUPPORTED_MEDIA_DESCRIPTION}.`);
  return { sourceUrl, url: `${base}${filename}`, mimeType: detected.mimeType, kind: detected.kind, bytes: fs.statSync(filePath).size, alreadyHosted: true };
}

export async function importMediaFromUrl(sourceUrl: string): Promise<ImportedMedia> {
  if (typeof sourceUrl !== 'string' || !sourceUrl.trim() || sourceUrl.length > 2048) throw new ValidationError('Informe uma URL de mídia válida.');
  const trimmed = sourceUrl.trim();
  const hosted = alreadyHostedMedia(trimmed);
  if (hosted) return hosted;

  const { response, abort } = await safeGet(trimmed, {
    allowHttp: true,
    timeoutMs: 30_000,
    headers: { Accept: 'image/*,video/*;q=0.9,*/*;q=0.1' },
  });
  const deadline = setTimeout(() => response.destroy(new UnsafeUrlError('O download demorou demais.')), DOWNLOAD_DEADLINE_MS);
  const dir = uploadRoot();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, `.import-${crypto.randomUUID()}.part`);

  try {
    if (response.statusCode !== 200) {
      response.resume();
      throw new ValidationError(`O servidor de origem respondeu com o status ${response.statusCode}. Use uma URL pública e direta do arquivo.`);
    }
    const declared = Number(response.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_MEDIA_BYTES) throw new ValidationError('A mídia é maior que 100 MB.');

    let bytes = 0;
    let head = Buffer.alloc(0);
    let detected: DetectedMedia | null = null;
    const inspector = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > MAX_MEDIA_BYTES) return callback(new ValidationError('A mídia é maior que 100 MB.'));
        if (!detected) {
          head = Buffer.concat([head, chunk]).subarray(0, 16);
          if (head.length >= 16 || bytes >= 16) {
            detected = detectMediaSignature(head);
            if (!detected) return callback(new ValidationError(`A URL não aponta para uma imagem ou vídeo suportado (${SUPPORTED_MEDIA_DESCRIPTION}). Use o link direto do arquivo, não de uma página.`));
          }
        }
        callback(null, chunk);
      },
      flush(callback) {
        if (!detected) detected = detectMediaSignature(head);
        callback(detected ? null : new ValidationError(`A URL não aponta para uma imagem ou vídeo suportado (${SUPPORTED_MEDIA_DESCRIPTION}).`));
      },
    });
    await pipeline(response, inspector, fs.createWriteStream(tempPath, { flags: 'wx' }));
    const media = detected as DetectedMedia | null;
    if (!media || bytes === 0) throw new ValidationError('A mídia baixada está vazia.');

    const filename = newUploadFilename(media.extension);
    await fs.promises.rename(tempPath, path.join(dir, filename));
    return { sourceUrl: trimmed, url: `${publicMediaBase()}/${filename}`, mimeType: media.mimeType, kind: media.kind, bytes, alreadyHosted: false };
  } catch (error) {
    await fs.promises.unlink(tempPath).catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(deadline);
    abort();
  }
}
