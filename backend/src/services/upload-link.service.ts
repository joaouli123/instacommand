import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';

const LINK_TTL_MS = 30 * 60_000;

const sign = (payload: string) => crypto.createHmac('sha256', `upload-link:${env.JWT_SECRET}`).update(payload).digest('base64url');

/** Token = base64url(userId).expiresAt.signature — valid for 30 minutes, many files. */
export function createUploadLink(userId: string) {
  const expiresAt = Date.now() + LINK_TTL_MS;
  const payload = `${Buffer.from(userId).toString('base64url')}.${expiresAt}`;
  const token = `${payload}.${sign(payload)}`;
  const uploadUrl = `${env.BACKEND_URL.replace(/\/$/, '')}/api/posts/drop/${token}`;
  return {
    uploadUrl,
    expiresAt: new Date(expiresAt).toISOString(),
    curl: `curl -sS -F "files=@imagem.png" "${uploadUrl}"`,
  };
}

export function verifyUploadToken(token: string, options: { allowExpired?: boolean } = {}): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [user, exp, signature] = parts;
  const expected = sign(`${user}.${exp}`);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  if (!/^\d+$/.test(exp) || (!options.allowExpired && Number(exp) < Date.now())) return null;
  return Buffer.from(user, 'base64url').toString('utf8') || null;
}

// ---- Upload batches: every file sent through one link, in the order received ----

export type DropItem = { url: string; uploadedAt: string };

const dropFile = (token: string) => {
  const dir = path.resolve(process.cwd(), env.MEDIA_UPLOAD_DIR, '.drops');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${crypto.createHash('sha256').update(token).digest('hex')}.json`);
};

export function readDrop(token: string): DropItem[] {
  try { return JSON.parse(fs.readFileSync(dropFile(token), 'utf8')); } catch { return []; }
}

export function recordDrop(token: string, urls: string[]): DropItem[] {
  const now = new Date().toISOString();
  const batch = [...readDrop(token), ...urls.map((url) => ({ url, uploadedAt: now }))].slice(-20);
  fs.writeFileSync(dropFile(token), JSON.stringify(batch));
  return batch;
}

export function clearDrop(token: string) {
  try { fs.unlinkSync(dropFile(token)); } catch { /* nothing sent yet */ }
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** No-JavaScript page so the API's CSP stays strict. */
export function dropPage({ batch = [], sent, error }: { batch?: DropItem[]; sent?: number; error?: string }) {
  const items = batch.map((item, index) => `<li><span>${index + 1}</span><img src="${escapeHtml(item.url)}" alt="Imagem ${index + 1}"></li>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Enviar mídias</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;padding:24px 16px;background:#f6f6f8;color:#1a1a1a}
h1{font-size:22px}form{background:#fff;border:2px dashed #b9b9c6;border-radius:12px;padding:20px;display:grid;gap:12px}
button{background:#6d28d9;color:#fff;border:0;border-radius:8px;padding:12px;font-size:16px;cursor:pointer}
.ok{background:#e7f8ec;border-radius:8px;padding:12px}.err{background:#fde8e8;border-radius:8px;padding:12px}
ol{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
li{position:relative;background:#fff;border-radius:8px;overflow:hidden}li img{width:100%;aspect-ratio:1;object-fit:cover;display:block}
li span{position:absolute;top:6px;left:6px;background:#000c;color:#fff;border-radius:99px;padding:2px 8px;font-size:13px}</style></head><body>
<h1>Enviar imagens para o agendamento</h1>
${error ? `<p class="err">${escapeHtml(error)}</p>` : `
${sent ? `<p class="ok">${sent} arquivo(s) recebido(s). Volte ao chat e diga ao Claude: <b>“enviei”</b>.</p>` : '<p>Escolha as imagens ou vídeos na ordem do post (até 10 por vez). Depois volte ao chat e diga “enviei”.</p>'}
<form method="post" enctype="multipart/form-data"><input type="file" name="files" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime" multiple required><button type="submit">Enviar</button></form>
${items ? `<h2>Recebidas neste link (ordem do post)</h2><ol>${items}</ol>` : ''}`}
</body></html>`;
}
