#!/usr/bin/env node
/*
 * InstaCommand CLI: manage Instagram, Facebook and Threads from the terminal,
 * and bridge any local MCP client (Claude Desktop, Cursor, Codex...) to the
 * InstaCommand MCP server with `instacommand mcp`.
 *
 * Single file with zero dependencies (Node.js 18+) so it can be downloaded
 * from the server and run with `node instacommand.cjs`. Do not import project
 * modules here: tests assert that this file only requires `node:` built-ins.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const VERSION = '1.0.0';
// The server replaces this placeholder with its own URL when serving the download.
const EMBEDDED_API_URL = '__INSTACOMMAND_DEFAULT_API_URL__';
const DEFAULT_API_URL = EMBEDDED_API_URL.startsWith('__') ? 'http://localhost:3001' : EMBEDDED_API_URL;
const PROTOCOL_VERSION = '2025-11-25';
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

// ---------------------------------------------------------------- errors & output

class CliError extends Error {
  constructor(message: string, public exitCode = 1) {
    super(message);
  }
}

const usageError = (message: string) => new CliError(`${message}\nUse "instacommand help" para ver os comandos.`, 2);
const stderr = (message: string) => process.stderr.write(`${message}\n`);
const stdout = (message: string) => process.stdout.write(`${message}\n`);
const printJson = (value: unknown) => stdout(JSON.stringify(value, null, 2));

// ---------------------------------------------------------------- arguments

const BOOLEAN_FLAGS = new Set([
  'json', 'yes', 'help', 'version', 'schedule', 'draft', 'queue', 'wait', 'ai-generated', 'all',
  'disable-comments', 'enable-comments', 'replies', 'stdin', 'no-ai-generated', 'clear-audio',
  'ai-label', 'no-ai-label', 'no-feed', 'feed', 'no-location', 'no-cover',
]);
const SHORT_FLAGS: Record<string, string> = { h: 'help', y: 'yes', v: 'version', j: 'json' };

type Flags = Record<string, string | boolean | string[]>;
type Parsed = { positionals: string[]; flags: Flags };

export function parseArgv(argv: string[]): Parsed {
  const positionals: string[] = [];
  const flags: Flags = {};
  const add = (key: string, value: string | boolean) => {
    const existing = flags[key];
    if (existing === undefined) flags[key] = value;
    else if (Array.isArray(existing)) existing.push(String(value));
    else flags[key] = [String(existing), String(value)];
  };
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === '--') { positionals.push(...argv.slice(index + 1)); break; }
    if (token.startsWith('--')) {
      const body = token.slice(2);
      const equals = body.indexOf('=');
      if (equals >= 0) { add(body.slice(0, equals), body.slice(equals + 1)); continue; }
      if (BOOLEAN_FLAGS.has(body)) { add(body, true); continue; }
      const next = argv[index + 1];
      if (next === undefined || (next.startsWith('--') && next.length > 2)) throw usageError(`A opção --${body} precisa de um valor.`);
      add(body, next);
      index++;
      continue;
    }
    if (/^-[a-z]$/i.test(token) && SHORT_FLAGS[token[1]]) { add(SHORT_FLAGS[token[1]], true); continue; }
    positionals.push(token);
  }
  return { positionals, flags };
}

const flagString = (flags: Flags, key: string): string | undefined => {
  const value = flags[key];
  if (value === undefined || typeof value === 'boolean') return undefined;
  return Array.isArray(value) ? value[value.length - 1] : value;
};
const flagList = (flags: Flags, key: string): string[] => {
  const value = flags[key];
  if (value === undefined || typeof value === 'boolean') return [];
  return (Array.isArray(value) ? value : [value]).flatMap((item) => item.split(',')).map((item) => item.trim()).filter(Boolean);
};
const flagRepeat = (flags: Flags, key: string): string[] => {
  const value = flags[key];
  if (value === undefined || typeof value === 'boolean') return [];
  return Array.isArray(value) ? value : [value];
};
const flagBool = (flags: Flags, key: string) => flags[key] === true || flags[key] === 'true';
const flagInt = (flags: Flags, key: string) => {
  const value = flagString(flags, key);
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number)) throw usageError(`--${key} precisa ser um número inteiro.`);
  return number;
};

// ---------------------------------------------------------------- configuration

type Profile = { apiUrl?: string; token?: string };
type Config = { currentProfile: string; profiles: Record<string, Profile> };

const configDir = () => process.env.INSTACOMMAND_CONFIG_DIR || path.join(os.homedir(), '.instacommand');
const configPath = () => path.join(configDir(), 'config.json');

function loadConfig(): Config {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    if (parsed && typeof parsed === 'object' && parsed.profiles && typeof parsed.profiles === 'object') {
      return { currentProfile: typeof parsed.currentProfile === 'string' ? parsed.currentProfile : 'default', profiles: parsed.profiles };
    }
  } catch { /* first run or unreadable file: start clean */ }
  return { currentProfile: 'default', profiles: {} };
}

function saveConfig(config: Config) {
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try { fs.chmodSync(configPath(), 0o600); } catch { /* Windows ignores POSIX modes */ }
}

type Context = { apiUrl: string; token?: string; profileName: string; json: boolean };

function resolveContext(flags: Flags): Context {
  const config = loadConfig();
  const profileName = flagString(flags, 'profile') || process.env.INSTACOMMAND_PROFILE || config.currentProfile || 'default';
  const profile = config.profiles[profileName] || {};
  const apiUrl = (flagString(flags, 'api-url') || process.env.INSTACOMMAND_API_URL || profile.apiUrl || DEFAULT_API_URL).replace(/\/+$/, '').replace(/\/api$/, '');
  const token = flagString(flags, 'token') || process.env.INSTACOMMAND_TOKEN || profile.token;
  return { apiUrl, token, profileName, json: flagBool(flags, 'json') };
}

const requireToken = (ctx: Context) => {
  if (!ctx.token) throw new CliError('Nenhum token configurado. Rode "instacommand login" ou defina INSTACOMMAND_TOKEN.');
  return ctx.token;
};

const maskToken = (token?: string) => (token ? `${token.slice(0, 11)}…${token.slice(-4)}` : '(nenhum)');

// ---------------------------------------------------------------- HTTP

const describeNetworkError = (ctx: Context, error: unknown) => {
  const reason = error instanceof Error ? ((error as any).cause?.code || error.message) : String(error);
  return new CliError(`Não foi possível conectar a ${ctx.apiUrl} (${reason}). Confira a URL com "instacommand config".`);
};

async function restRequest(ctx: Context, method: string, pathname: string, init: { body?: unknown; form?: FormData } = {}) {
  const token = requireToken(ctx);
  let response: Response;
  try {
    response = await fetch(`${ctx.apiUrl}/api${pathname}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
      signal: AbortSignal.timeout(10 * 60_000),
    });
  } catch (error) {
    throw describeNetworkError(ctx, error);
  }
  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text.slice(0, 300) }; }
  if (response.status === 401) throw new CliError('Token inválido, expirado ou revogado. Rode "instacommand login" com um token novo.');
  if (!response.ok) throw new CliError(payload?.error || payload?.message || `A API respondeu com status ${response.status}.`);
  return payload;
}

let rpcCounter = 0;
let negotiatedProtocol = PROTOCOL_VERSION;

const parseSse = (text: string) => text.split(/\r?\n\r?\n/).flatMap((event) => {
  const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
  if (!data) return [];
  try { return [JSON.parse(data)]; } catch { return []; }
});

/** Sends one JSON-RPC message to the remote MCP server and returns the matching response (or null for notifications). */
async function postMcp(ctx: Context, message: any): Promise<any> {
  const token = requireToken(ctx);
  let response: Response;
  try {
    response = await fetch(`${ctx.apiUrl}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': negotiatedProtocol,
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(15 * 60_000),
    });
  } catch (error) {
    throw describeNetworkError(ctx, error);
  }
  if (response.status === 401) throw new CliError('Token inválido, expirado ou revogado. Rode "instacommand login" com um token novo.');
  if (response.status === 202 || message.id === undefined) return null;
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const messages = contentType.includes('text/event-stream') ? parseSse(text) : (() => { try { return [JSON.parse(text)]; } catch { return []; } })();
  const reply = messages.find((item) => item && item.id === message.id);
  if (!reply) throw new CliError(`Resposta inesperada do servidor MCP (status ${response.status}).`);
  return reply;
}

async function mcpRequest(ctx: Context, method: string, params: Record<string, unknown> = {}) {
  const reply = await postMcp(ctx, { jsonrpc: '2.0', id: `cli-${++rpcCounter}`, method, params });
  if (reply.error) throw new CliError(reply.error.message || 'Erro do servidor MCP.');
  return reply.result;
}

async function callTool(ctx: Context, name: string, args: Record<string, unknown> = {}): Promise<any> {
  const result = await mcpRequest(ctx, 'tools/call', { name, arguments: args });
  const text = (result?.content || []).filter((item: any) => item?.type === 'text').map((item: any) => item.text).join('\n');
  if (result?.isError) throw new CliError(text || `A ferramenta ${name} falhou.`);
  if (result?.structuredContent !== undefined) return result.structuredContent;
  try { return JSON.parse(text); } catch { return { text }; }
}

// ---------------------------------------------------------------- local media

/** Same signatures the server accepts (see src/utils/media-signature.ts). */
export function detectMedia(head: Buffer): { kind: 'image' | 'video'; mimeType: string; extension: string } | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { kind: 'image', mimeType: 'image/jpeg', extension: '.jpg' };
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: 'image', mimeType: 'image/png', extension: '.png' };
  if (head.length >= 6 && ['GIF87a', 'GIF89a'].includes(head.subarray(0, 6).toString('latin1'))) return { kind: 'image', mimeType: 'image/gif', extension: '.gif' };
  if (head.length >= 12 && head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return { kind: 'image', mimeType: 'image/webp', extension: '.webp' };
  if (head.length >= 12 && head.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = head.subarray(8, 12).toString('latin1');
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'avif', 'avis'].includes(brand)) return null;
    if (brand === 'qt  ') return { kind: 'video', mimeType: 'video/quicktime', extension: '.mov' };
    return { kind: 'video', mimeType: 'video/mp4', extension: '.mp4' };
  }
  return null;
}

const allowedMediaRoots = () => (process.env.INSTACOMMAND_MEDIA_DIRS || '').split(path.delimiter).map((dir) => dir.trim()).filter(Boolean).map((dir) => path.resolve(dir));

function inspectLocalFile(filePath: string) {
  const resolved = path.resolve(filePath.replace(/^~(?=$|[\\/])/, os.homedir()));
  const roots = allowedMediaRoots();
  if (roots.length && !roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    throw new CliError(`${filePath}: fora das pastas permitidas em INSTACOMMAND_MEDIA_DIRS.`);
  }
  let stat: fs.Stats;
  try { stat = fs.statSync(resolved); } catch { throw new CliError(`${filePath}: arquivo não encontrado.`); }
  if (!stat.isFile()) throw new CliError(`${filePath}: não é um arquivo.`);
  if (stat.size > MAX_UPLOAD_BYTES) throw new CliError(`${filePath}: maior que 100 MB.`);
  const head = Buffer.alloc(16);
  const fd = fs.openSync(resolved, 'r');
  try { fs.readSync(fd, head, 0, 16, 0); } finally { fs.closeSync(fd); }
  const detected = detectMedia(head);
  // Only real images and videos leave the machine, never arbitrary files.
  if (!detected) throw new CliError(`${filePath}: não é uma imagem ou vídeo suportado (JPG, PNG, WebP, GIF, MP4 ou MOV).`);
  return { resolved, size: stat.size, ...detected };
}

async function uploadLocalFiles(ctx: Context, filePaths: string[]): Promise<{ urls: string[]; items: any[] }> {
  if (!filePaths.length) return { urls: [], items: [] };
  if (filePaths.length > 10) throw new CliError('Envie no máximo 10 arquivos por vez.');
  const files = filePaths.map(inspectLocalFile);
  const form = new FormData();
  for (const [index, file] of files.entries()) {
    const openAsBlob = (fs as any).openAsBlob as ((path: string, options?: { type?: string }) => Promise<Blob>) | undefined;
    const blob = openAsBlob ? await openAsBlob(file.resolved, { type: file.mimeType }) : new Blob([new Uint8Array(fs.readFileSync(file.resolved))], { type: file.mimeType });
    form.append('files', blob, `upload-${index + 1}${file.extension}`);
  }
  const result = await restRequest(ctx, 'POST', '/posts/upload', { form });
  const urls: string[] = result?.urls || [];
  return { urls, items: files.map((file, index) => ({ path: file.resolved, url: urls[index], mimeType: file.mimeType, bytes: file.size })) };
}

const isUrl = (value: string) => /^https?:\/\//i.test(value);

/** Uploads local paths and imports remote URLs, preserving the order given. */
async function resolveMedia(ctx: Context, values: string[]): Promise<string[]> {
  const local = values.filter((value) => !isUrl(value));
  const remote = values.filter(isUrl);
  const uploaded = local.length ? (await uploadLocalFiles(ctx, local)).urls : [];
  const imported = remote.length ? (await callTool(ctx, 'import_media_from_url', { urls: remote })) : { urls: [], errors: [] };
  if (imported.errors?.length) throw new CliError(`Falha ao importar: ${imported.errors.map((error: any) => `${error.sourceUrl}: ${error.message}`).join('; ')}`);
  let localIndex = 0;
  let remoteIndex = 0;
  return values.map((value) => (isUrl(value) ? imported.urls[remoteIndex++] : uploaded[localIndex++]));
}

// ---------------------------------------------------------------- dates

const pad = (value: number) => String(value).padStart(2, '0');

export function toLocalIsoWithOffset(date: Date) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Accepts ISO 8601 with offset, or local "AAAA-MM-DD HH:mm" / "DD/MM/AAAA HH:mm" interpreted in this computer's time zone. */
export function parseDateTimeArg(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(trimmed)) {
    if (Number.isNaN(new Date(trimmed).getTime())) throw usageError(`Data inválida: ${value}`);
    return trimmed;
  }
  let parts: number[] | null = null;
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (iso) parts = [Number(iso[1]), Number(iso[2]), Number(iso[3]), Number(iso[4]), Number(iso[5]), Number(iso[6] || 0)];
  else if (br) parts = [Number(br[3]), Number(br[2]), Number(br[1]), Number(br[4]), Number(br[5]), Number(br[6] || 0)];
  if (!parts) throw usageError(`Data inválida: ${value}. Use "2026-10-10 18:30", "10/10/2026 18:30" ou ISO com fuso.`);
  const [year, month, day, hour, minute, second] = parts;
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) {
    throw usageError(`Data inválida: ${value}`);
  }
  return toLocalIsoWithOffset(date);
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

// ---------------------------------------------------------------- lookups

const PLATFORM_ALIASES: Record<string, string> = { instagram: 'INSTAGRAM', ig: 'INSTAGRAM', facebook: 'FACEBOOK', fb: 'FACEBOOK', threads: 'THREADS', th: 'THREADS', x: 'X', twitter: 'X' };
const parsePlatforms = (values: string[]) => values.map((value) => {
  const platform = PLATFORM_ALIASES[value.toLowerCase()];
  if (!platform) throw usageError(`Rede desconhecida: ${value}. Use instagram, facebook, threads e/ou x.`);
  return platform;
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let accountsCache: any = null;
const loadAccounts = async (ctx: Context) => (accountsCache ??= await callTool(ctx, 'list_accounts'));

const KIND_NAMES = { instagram: 'do Instagram', threads: 'do Threads', x: 'do X' } as const;
const KIND_FLAGS = { instagram: 'account', threads: 'threads-account', x: 'x-account' } as const;

async function resolveAccount(ctx: Context, value: string | undefined, kind: 'instagram' | 'threads' | 'x', required: boolean): Promise<string | undefined> {
  if (value && UUID.test(value)) return value;
  const accounts = await loadAccounts(ctx);
  const list: any[] = (kind === 'instagram' ? accounts.instagram : kind === 'x' ? accounts.x : accounts.threads) || [];
  if (value) {
    const username = value.replace(/^@/, '').toLowerCase();
    const match = list.find((account) => String(account.username).toLowerCase() === username);
    if (!match) throw new CliError(`Conta ${KIND_NAMES[kind]} @${username} não encontrada. Veja "instacommand accounts".`);
    return match.id;
  }
  if (list.length === 1) return list[0].id;
  if (!required) return undefined;
  throw usageError(list.length
    ? `Escolha a conta ${KIND_NAMES[kind]} com --${KIND_FLAGS[kind]} (id ou @usuário).`
    : `Nenhuma conta ${KIND_NAMES[kind]} conectada.`);
}

// ---------------------------------------------------------------- human output

const STATUS_LABELS: Record<string, string> = { DRAFT: 'Rascunho', SCHEDULED: 'Agendado', PROCESSING: 'Enviando', PUBLISHED: 'Publicado', FAILED: 'Falhou' };
const NETWORK_SHORT: Record<string, string> = { INSTAGRAM: 'IG', FACEBOOK: 'FB', THREADS: 'TH', X: 'X' };

function printPostLine(post: any) {
  const networks = (post.platforms || []).map((platform: string) => NETWORK_SHORT[platform] || platform).join('+');
  const text = String(post.captionPreview ?? post.caption ?? '').replace(/\s+/g, ' ').slice(0, 60);
  stdout(`${formatDate(post.scheduledFor).padEnd(17)} ${(STATUS_LABELS[post.status] || post.status).padEnd(10)} ${String(post.mediaType).padEnd(8)} ${networks.padEnd(8)} ${post.id}  ${text}`);
}

function printPost(post: any) {
  stdout(`ID:          ${post.id}`);
  stdout(`Status:      ${STATUS_LABELS[post.status] || post.status}`);
  stdout(`Formato:     ${post.mediaType}`);
  stdout(`Redes:       ${(post.platforms || []).join(', ')}`);
  stdout(`Data:        ${formatDate(post.scheduledFor)} (${post.scheduledFor})`);
  stdout(`Mídias:      ${(post.mediaUrls || []).length ? '' : '(nenhuma)'}`);
  for (const url of post.mediaUrls || []) stdout(`  - ${url}`);
  stdout('Legenda (como será publicada):');
  stdout(String(post.captionAsPublished ?? post.caption ?? '').split('\n').map((line) => `  ${line}`).join('\n') || '  (vazia)');
  if (post.errorMessage) stdout(`Erro:        ${post.errorMessage}`);
  if (post.published?.permalink) stdout(`Link:        ${post.published.permalink}`);
}

const output = (ctx: Context, value: unknown, human: () => void) => (ctx.json ? printJson(value) : human());

// ---------------------------------------------------------------- prompts

async function prompt(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  if (hidden) {
    const writer = rl as unknown as { _writeToOutput: (text: string) => void; output: NodeJS.WritableStream };
    writer._writeToOutput = (text: string) => { if (text.includes(question)) writer.output.write(text); };
  }
  try {
    return await new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
  } finally {
    rl.close();
    if (hidden) process.stderr.write('\n');
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8').trim();
}

const requireYes = (flags: Flags, action: string) => {
  if (!flagBool(flags, 'yes')) throw usageError(`${action} é irreversível. Repita o comando com --yes para confirmar.`);
};

// ---------------------------------------------------------------- post arguments

function readCaption(flags: Flags): string | undefined {
  const file = flagString(flags, 'caption-file');
  if (file) {
    try { return fs.readFileSync(path.resolve(file), 'utf8').replace(/\r\n/g, '\n').trimEnd(); } catch { throw new CliError(`Não foi possível ler ${file}.`); }
  }
  const caption = flagString(flags, 'caption');
  return caption === undefined ? undefined : caption.replace(/\\n/g, '\n');
}

function inferMediaType(media: string[], platforms: string[]) {
  if (!media.length) return platforms.length > 0 && platforms.every((platform) => platform === 'THREADS' || platform === 'X') ? 'TEXT' : undefined;
  if (media.length > 1) return 'CAROUSEL';
  return /\.(mp4|mov)(\?|$)/i.test(media[0]) ? 'REEL' : 'IMAGE';
}

/** Parses "--tag @user:x:y[:index]" (x/y from 0 to 1, index 0 = first media). */
export function parseUserTag(value: string) {
  const [username, x, y, index = '0'] = value.split(':').map((part) => part.trim());
  const tag = { username: (username || '').replace(/^@/, ''), x: Number(x), y: Number(y), mediaIndex: Number(index) };
  if (!tag.username || x === undefined || y === undefined || !Number.isFinite(tag.x) || !Number.isFinite(tag.y) || !Number.isInteger(tag.mediaIndex)) {
    throw usageError(`Marcação inválida: "${value}". Use --tag "@usuario:0.5:0.5[:indice]".`);
  }
  return tag;
}

const TRIAL_REEL_VALUES: Record<string, string | null> = { manual: 'MANUAL', auto: 'SS_PERFORMANCE', ss_performance: 'SS_PERFORMANCE', off: null, none: null };

/** Flags that change Instagram advanced options, merged over `current` (an update keeps untouched options). */
export async function advancedSettingsFromFlags(
  flags: Flags,
  current: Record<string, unknown> | null = null,
  searchLocation?: (query: string) => Promise<{ id: string; name: string } | null>,
) {
  const settings: Record<string, unknown> = {};
  const alt = [...flagRepeat(flags, 'alt'), ...flagRepeat(flags, 'alt-text')];
  if (alt.length) settings.altTexts = alt;
  const collaborators = [...flagList(flags, 'collaborators'), ...flagRepeat(flags, 'collaborator')];
  if (collaborators.length) settings.collaborators = collaborators.map((user) => user.replace(/^@/, ''));
  const firstComment = flagString(flags, 'first-comment');
  if (firstComment !== undefined) settings.firstComment = firstComment.replace(/\\n/g, '\n');
  if (flagBool(flags, 'disable-comments')) settings.disableComments = true;
  if (flagBool(flags, 'enable-comments')) settings.disableComments = false;
  const tags = flagRepeat(flags, 'tag');
  if (tags.length) settings.userTags = tags.map(parseUserTag);

  const locationSearch = flagString(flags, 'location-search');
  const location = flagString(flags, 'location');
  if (flagBool(flags, 'no-location')) { settings.locationId = null; settings.locationName = null; }
  else if (location) {
    settings.locationId = location;
    settings.locationName = flagString(flags, 'location-name') ?? null;
  } else if (locationSearch) {
    if (!searchLocation) throw usageError('--location-search precisa de uma conta do Instagram.');
    const found = await searchLocation(locationSearch);
    if (!found) throw new CliError(`Nenhum local encontrado para "${locationSearch}". Use --location <ID ou link da Página do Facebook>.`, 1);
    stderr(`Localização: ${found.name} (${found.id})`);
    settings.locationId = found.id;
    settings.locationName = found.name;
  }

  if (flagBool(flags, 'no-feed')) settings.shareToFeed = false;
  if (flagBool(flags, 'feed')) settings.shareToFeed = true;
  const coverUrl = flagString(flags, 'cover-url');
  if (coverUrl) { settings.coverUrl = coverUrl; settings.thumbOffset = null; }
  const thumbOffset = flagString(flags, 'thumb-offset');
  if (thumbOffset !== undefined) {
    const value = Number(thumbOffset);
    if (!Number.isInteger(value) || value < 0) throw usageError('--thumb-offset deve ser o tempo do quadro em milissegundos (ex.: 1500).');
    settings.thumbOffset = value;
    settings.coverUrl = null;
  }
  if (flagBool(flags, 'no-cover')) { settings.coverUrl = null; settings.thumbOffset = null; }
  const trial = flagString(flags, 'trial-reel');
  if (trial !== undefined) {
    const key = trial.toLowerCase();
    if (!(key in TRIAL_REEL_VALUES)) throw usageError('--trial-reel aceita manual, auto ou off.');
    settings.trialGraduation = TRIAL_REEL_VALUES[key];
  }
  if (!Object.keys(settings).length) return undefined;
  return { ...(current ?? {}), ...settings };
}

async function findLocation(ctx: Context, accountId: string | undefined, flags: Flags, query: string) {
  const result = await callTool(ctx, 'locations_search', { accountId: accountId ?? await resolveAccount(ctx, flagString(flags, 'account'), 'instagram', true), query });
  if (result?.unavailable) throw new CliError(result.message || 'A busca de locais não está disponível.', 1);
  return (result?.items?.[0] as { id: string; name: string } | undefined) ?? null;
}

async function postArgsFromFlags(ctx: Context, flags: Flags, mode: 'create' | 'update', postId?: string, postAccountId?: string) {
  const args: Record<string, unknown> = {};
  const platformsFlag = flagList(flags, 'platforms');
  const platforms = platformsFlag.length ? parsePlatforms(platformsFlag) : mode === 'create' ? ['INSTAGRAM'] : undefined;
  if (platforms) args.platforms = platforms;
  if (mode === 'create') args.accountId = await resolveAccount(ctx, flagString(flags, 'account'), 'instagram', true);
  if (platforms?.includes('THREADS') || flagString(flags, 'threads-account')) {
    args.threadsAccountId = await resolveAccount(ctx, flagString(flags, 'threads-account'), 'threads', mode === 'create');
  }
  if (platforms?.includes('X') || flagString(flags, 'x-account')) {
    args.xAccountId = await resolveAccount(ctx, flagString(flags, 'x-account'), 'x', mode === 'create');
  }
  const mediaValues = flagRepeat(flags, 'media').flatMap((value) => value.split(',').map((item) => item.trim()).filter(Boolean));
  let media: string[] | undefined;
  if (mediaValues.length) media = await resolveMedia(ctx, mediaValues);
  if (media) args.mediaUrls = media;
  const type = flagString(flags, 'type')?.toUpperCase();
  if (type) args.mediaType = type === 'FEED' ? 'IMAGE' : type;
  else if (mode === 'create') {
    const inferred = inferMediaType(media ?? [], (platforms as string[]) ?? ['INSTAGRAM']);
    if (!inferred) throw usageError('Informe --media (arquivos ou URLs) ou --type TEXT para um post só de texto no Threads.');
    args.mediaType = inferred;
    stderr(`Formato: ${inferred} (use --type para mudar).`);
  }
  const caption = readCaption(flags);
  if (caption !== undefined) args.caption = caption;
  else if (mode === 'create') args.caption = '';
  const hashtags = flagList(flags, 'hashtags');
  if (hashtags.length) args.hashtags = hashtags.map((tag) => tag.replace(/^#/, ''));
  const at = flagString(flags, 'at');
  if (at) args.scheduledFor = parseDateTimeArg(at);
  if (flagBool(flags, 'ai-generated') || flagBool(flags, 'ai-label')) args.isAiGenerated = true;
  if (flagBool(flags, 'no-ai-generated') || flagBool(flags, 'no-ai-label')) args.isAiGenerated = false;
  const audioId = flagString(flags, 'audio-id');
  if (audioId) args.instagramAudio = { id: audioId, ...(flagString(flags, 'audio-title') ? { title: flagString(flags, 'audio-title') } : {}) };
  if (flagBool(flags, 'clear-audio')) args.instagramAudio = null;
  const advanced = await advancedSettingsFromFlags(flags, null, (query) => findLocation(ctx, (args.accountId as string | undefined) ?? postAccountId, flags, query));
  if (advanced) {
    // update_post replaces the whole advancedSettings object: keep what the post already has.
    if (mode === 'update' && postId) {
      const existing = await callTool(ctx, 'get_post', { postId });
      args.advancedSettings = { ...(existing?.advancedSettings ?? {}), ...advanced };
    } else args.advancedSettings = advanced;
  }
  return args;
}

// ---------------------------------------------------------------- generic tool arguments

function setPath(target: Record<string, any>, key: string, value: unknown) {
  const parts = key.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (typeof cursor[part] !== 'object' || cursor[part] === null) cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
}

export function parseToolArgs(positionals: string[], flags: Flags): Record<string, unknown> {
  let args: Record<string, unknown> = {};
  const file = flagString(flags, 'args-file');
  const inline = flagString(flags, 'args');
  try {
    if (file) args = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    if (inline) args = { ...args, ...JSON.parse(inline) };
  } catch {
    throw usageError('--args/--args-file precisa conter um objeto JSON válido.');
  }
  for (const pair of positionals) {
    const equals = pair.indexOf('=');
    if (equals <= 0) throw usageError(`Argumento inválido "${pair}". Use chave=valor.`);
    const raw = pair.slice(equals + 1);
    let value: unknown = raw;
    try { value = JSON.parse(raw); } catch { /* plain string */ }
    setPath(args, pair.slice(0, equals), value);
  }
  return args;
}

// ---------------------------------------------------------------- MCP stdio bridge

const LOCAL_UPLOAD_TOOL = {
  name: 'upload_local_media',
  title: 'Enviar arquivos locais',
  description: 'Envia imagens e vídeos deste computador para o InstaCommand e devolve URLs públicas para usar em mediaUrls (create_post/update_post). Aceita JPG, PNG, WebP, GIF, MP4 e MOV, até 100 MB cada, no máximo 10 por vez. A ordem das URLs segue a ordem dos caminhos.',
  inputSchema: {
    type: 'object',
    properties: { paths: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10, description: 'Caminhos absolutos (ou relativos à pasta de trabalho) dos arquivos.' } },
    required: ['paths'],
    additionalProperties: false,
  },
  annotations: { title: 'Enviar arquivos locais', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
};

async function runBridge(ctx: Context) {
  const pending = new Set<Promise<void>>();
  let closing = false;
  const send = (message: unknown) => process.stdout.write(`${JSON.stringify(message)}\n`);
  if (!ctx.token) stderr('[instacommand] Nenhum token configurado: defina INSTACOMMAND_TOKEN ou rode "instacommand login".');
  stderr(`[instacommand] Ponte MCP ativa para ${ctx.apiUrl}/mcp`);

  const handle = async (message: any) => {
    // Notifications and client responses need no reply; the remote server is stateless.
    if (!message || typeof message.method !== 'string' || message.id === undefined || message.id === null) return;
    try {
      if (message.method === 'tools/call' && message.params?.name === LOCAL_UPLOAD_TOOL.name) {
        try {
          const paths = message.params?.arguments?.paths;
          if (!Array.isArray(paths) || !paths.length || paths.some((item: unknown) => typeof item !== 'string')) throw new CliError('Informe paths com 1 a 10 caminhos de arquivo.');
          const result = await uploadLocalFiles(ctx, paths);
          send({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result } });
        } catch (error) {
          send({ jsonrpc: '2.0', id: message.id, result: { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] } });
        }
        return;
      }
      const reply = await postMcp(ctx, message);
      if (message.method === 'initialize' && typeof reply?.result?.protocolVersion === 'string') negotiatedProtocol = reply.result.protocolVersion;
      if (message.method === 'tools/list' && Array.isArray(reply?.result?.tools) && !message.params?.cursor) reply.result.tools.push(LOCAL_UPLOAD_TOOL);
      send(reply);
    } catch (error) {
      send({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } });
    }
  };

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let message: any;
    try { message = JSON.parse(line); } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido.' } });
      return;
    }
    for (const item of Array.isArray(message) ? message : [message]) {
      const task = handle(item).finally(() => {
        pending.delete(task);
        if (closing && !pending.size) process.exit(0);
      });
      pending.add(task);
    }
  });
  await new Promise<void>((resolve) => rl.on('close', () => resolve()));
  closing = true;
  if (!pending.size) process.exit(0);
}

// ---------------------------------------------------------------- commands

const HELP = `InstaCommand CLI ${VERSION} — gerencie Instagram, Facebook e Threads pelo terminal.

Uso: instacommand <comando> [opções]

Conexão
  login [--token T | --stdin] [--api-url URL] [--profile P]   Salva e valida um token pessoal
  logout [--profile P]                                         Remove o token salvo
  status                                                       Resumo do workspace e permissões
  config [show | set-url <url> | use <perfil>]                 Mostra ou altera a configuração

Contas
  accounts                                   Lista Instagram (+ Página do Facebook) e Threads
  accounts sync <id>                         Atualiza perfil e métricas
  accounts connect meta|threads|x [--replies]  Gera o link de autorização
  accounts pending                           Contas aguardando seleção
  accounts select <id> [<id>...]             Ativa as contas pendentes escolhidas
  accounts disconnect instagram|threads|x <id> --yes

Mídias
  media upload <arquivo> [...]               Envia arquivos locais e mostra as URLs
  media import <url> [...]                   Importa mídias de URLs públicas

Publicações
  posts [list] [--status S] [--account A] [--platform P] [--from D] [--to D] [--search T] [--limit N]
  calendar [--from D] [--to D] [--account A]  Agenda dos próximos 7 dias (padrão)
  posts get <id>
  posts create [--account A] [--media arquivo|url ...] [--type IMAGE|CAROUSEL|REEL|STORY|TEXT]
               [--caption T | --caption-file F] [--hashtags a,b] [--platforms instagram,facebook,threads,x]
               [--threads-account A] [--x-account A] [--at "2026-10-10 18:30"] [--schedule] [--first-comment T]
               [--audio-id ID]
     Instagram: [--ai-label | --no-ai-label]  (rótulo "Feito com IA")
                [--location <ID ou link da Página> [--location-name N] | --location-search "nome" | --no-location]
                [--alt-text T ...] [--collaborator @a ...] [--first-comment T] [--disable-comments | --enable-comments]
                [--tag "@usuario:x:y[:indice]" ...]  (x/y de 0 a 1; fotos e carrosséis)
     Reels:     [--no-feed | --feed] [--cover-url URL | --thumb-offset MS | --no-cover] [--trial-reel manual|auto|off]
  posts locations <nome> [--account A]       Busca locais para usar em --location
  posts update <id> [mesmas opções]
  posts schedule <id> --at <data>
  posts unschedule <id>
  posts publish <id> --yes [--wait | --queue]
  posts duplicate <id> --at <data> [--account A] [--platforms ...]
  posts delete <id> --yes

Relatórios, comunidade e IA
  analytics <relatório> [--account A] [--days 7|30|90|365|730]
            relatórios: dashboard, profile_report, growth, engagement, top_posts, posts, audience,
                        best_times, content_types, recommendations, access, facebook, threads, x
  comments [list] [--account A]
  comments reply <commentId> --media <mediaId> --message T [--account A] --yes
  comments delete <commentId> --media <mediaId> [--account A] --yes
  ai <caption|plan|daily|audit|reply> [--account A] [--topic T] [--tone T] [--audience T] [--objective T]
  automations [--account A] [--platform INSTAGRAM|FACEBOOK|THREADS]

Qualquer ferramenta MCP
  tools                                      Lista todas as ferramentas disponíveis
  call <ferramenta> [chave=valor ...] [--args '{"json":true}'] [--args-file f.json]

Integração com clientes de IA
  mcp                                        Ponte MCP via stdio (Claude Desktop, Cursor, Codex...)

Opções globais: --json, --profile P, --api-url URL, --token T, --help, --version
Datas: "2026-10-10 18:30" e "10/10/2026 18:30" usam o fuso deste computador; ISO com fuso também é aceito.
Variáveis: INSTACOMMAND_TOKEN, INSTACOMMAND_API_URL, INSTACOMMAND_PROFILE, INSTACOMMAND_CONFIG_DIR,
           INSTACOMMAND_MEDIA_DIRS (restringe as pastas de onde arquivos podem ser enviados).`;

async function commandLogin(flags: Flags) {
  const config = loadConfig();
  const ctx = resolveContext(flags);
  let token = flagString(flags, 'token');
  if (!token && flagBool(flags, 'stdin')) token = await readStdin();
  if (!token) {
    if (!process.stdin.isTTY) throw usageError('Informe --token ou use --stdin.');
    stderr('Crie um token pessoal no InstaCommand, na página "MCP e CLI" do menu lateral.');
    token = await prompt('Cole o token (ic_pat_...): ', true);
  }
  if (!/^ic_pat_[A-Za-z0-9_-]{43}$/.test(token)) throw new CliError('Formato de token inválido. Use um token pessoal (ic_pat_...) criado na página MCP e CLI.');
  const me = await restRequest({ ...ctx, token }, 'GET', '/auth/me');
  const profileName = flagString(flags, 'profile') || ctx.profileName;
  config.profiles[profileName] = { apiUrl: ctx.apiUrl, token };
  config.currentProfile = profileName;
  saveConfig(config);
  stdout(`Conectado como ${me.name} <${me.email}> em ${ctx.apiUrl} (perfil "${profileName}").`);
  stdout(`Configuração salva em ${configPath()}.`);
}

function commandLogout(flags: Flags) {
  const config = loadConfig();
  const profileName = flagString(flags, 'profile') || config.currentProfile;
  if (config.profiles[profileName]) delete config.profiles[profileName].token;
  saveConfig(config);
  stdout(`Token removido do perfil "${profileName}". Revogue-o também na página MCP e CLI se não for mais usá-lo.`);
}

function commandConfig(positionals: string[], flags: Flags) {
  const config = loadConfig();
  const [action, value] = positionals;
  if (!action || action === 'show') {
    const ctx = resolveContext(flags);
    const view = { file: configPath(), activeProfile: ctx.profileName, apiUrl: ctx.apiUrl, token: maskToken(ctx.token), profiles: Object.fromEntries(Object.entries(config.profiles).map(([name, profile]) => [name, { apiUrl: profile.apiUrl, token: maskToken(profile.token) }])) };
    return ctx.json ? printJson(view) : stdout(Object.entries(view).map(([key, item]) => `${key}: ${typeof item === 'string' ? item : JSON.stringify(item)}`).join('\n'));
  }
  if (action === 'set-url') {
    if (!value || !isUrl(value)) throw usageError('Informe a URL da API, ex.: instacommand config set-url https://api.exemplo.com');
    const profileName = flagString(flags, 'profile') || config.currentProfile;
    config.profiles[profileName] = { ...config.profiles[profileName], apiUrl: value.replace(/\/+$/, '').replace(/\/api$/, '') };
    saveConfig(config);
    return stdout(`URL do perfil "${profileName}": ${config.profiles[profileName].apiUrl}`);
  }
  if (action === 'use') {
    if (!value) throw usageError('Informe o nome do perfil.');
    config.currentProfile = value;
    saveConfig(config);
    return stdout(`Perfil ativo: ${value}`);
  }
  throw usageError(`Ação de config desconhecida: ${action}`);
}

async function commandStatus(ctx: Context) {
  const overview = await callTool(ctx, 'get_workspace_overview');
  output(ctx, overview, () => {
    stdout(`Workspace: ${overview.user.name} <${overview.user.email}>`);
    stdout(`Conexão:   ${overview.connection.name} · permissões: ${overview.connection.scopes.join(', ')}`);
    stdout(`Instagram: ${overview.instagramAccounts.map((account: any) => `@${account.username}${account.facebookPage ? ` (+ Facebook: ${account.facebookPage.name || account.facebookPage.id})` : ''}`).join(', ') || 'nenhuma conta'}`);
    stdout(`Threads:   ${overview.threadsAccounts.map((account: any) => `@${account.username}`).join(', ') || 'nenhuma conta'}`);
    stdout(`Posts:     ${Object.entries(overview.posts.byStatus).map(([status, count]) => `${STATUS_LABELS[status] || status}: ${count}`).join(' · ')}`);
    if (overview.posts.nextScheduled.length) { stdout('Próximos agendamentos:'); overview.posts.nextScheduled.forEach(printPostLine); }
    for (const hint of overview.hints || []) stdout(`• ${hint}`);
  });
}

async function commandAccounts(ctx: Context, positionals: string[], flags: Flags) {
  const [action = 'list', ...rest] = positionals;
  if (action === 'list') {
    const accounts = await callTool(ctx, 'list_accounts');
    return output(ctx, accounts, () => {
      stdout('Instagram:');
      for (const account of accounts.instagram) stdout(`  @${String(account.username).padEnd(24)} ${account.id}  ${account.followers ?? '?'} seguidores${account.facebookPage ? `  · Facebook: ${account.facebookPage.name || account.facebookPage.id}` : ''}`);
      if (!accounts.instagram.length) stdout('  (nenhuma) — conecte com "instacommand accounts connect meta"');
      stdout('Threads:');
      for (const account of accounts.threads) stdout(`  @${String(account.username).padEnd(24)} ${account.id}`);
      if (!accounts.threads.length) stdout('  (nenhuma) — conecte com "instacommand accounts connect threads"');
      stdout('X:');
      for (const account of accounts.x || []) stdout(`  @${String(account.username).padEnd(24)} ${account.id}  ${account.followers ?? '?'} seguidores`);
      if (!(accounts.x || []).length) stdout('  (nenhuma) — conecte com "instacommand accounts connect x"');
    });
  }
  if (action === 'get') return printJson(await callTool(ctx, 'get_account', { accountId: await resolveAccount(ctx, rest[0], 'instagram', true) }));
  if (action === 'sync') {
    const result = await callTool(ctx, 'sync_account', { accountId: await resolveAccount(ctx, rest[0] || flagString(flags, 'account'), 'instagram', true) });
    return output(ctx, result, () => stdout(result.message || 'Conta sincronizada.'));
  }
  if (action === 'connect') {
    const network = rest[0];
    if (network !== 'meta' && network !== 'threads' && network !== 'x') throw usageError('Use "accounts connect meta", "accounts connect threads" ou "accounts connect x".');
    const result = await callTool(ctx, 'start_account_connection', { network, enableThreadsReplies: flagBool(flags, 'replies') });
    return output(ctx, result, () => {
      stdout('Abra este link no navegador para autorizar (válido por 10 minutos):');
      stdout(result.authorizationUrl);
      for (const step of result.nextSteps || []) stdout(`• ${step}`);
    });
  }
  if (action === 'pending') {
    const result = await callTool(ctx, 'list_pending_accounts');
    return output(ctx, result, () => {
      if (!result.pending.length) return stdout('Nenhuma conta aguardando seleção.');
      for (const account of result.pending) stdout(`  @${String(account.username).padEnd(24)} ${account.id}`);
      stdout('Ative com: instacommand accounts select <id> [<id>...] (as não escolhidas são descartadas).');
    });
  }
  if (action === 'select') {
    if (!rest.length) throw usageError('Informe os IDs das contas a ativar.');
    return printJson(await callTool(ctx, 'select_accounts', { accountIds: rest }));
  }
  if (action === 'disconnect') {
    const [network, id] = rest;
    if (!['instagram', 'threads', 'x'].includes(network) || !id) throw usageError('Use "accounts disconnect instagram|threads|x <id> --yes".');
    requireYes(flags, 'Desconectar a conta');
    return printJson(await callTool(ctx, 'disconnect_account', { network, accountId: await resolveAccount(ctx, id, network as 'instagram' | 'threads' | 'x', true), confirm: true }));
  }
  throw usageError(`Ação desconhecida: accounts ${action}`);
}

async function commandMedia(ctx: Context, positionals: string[]) {
  const [action, ...values] = positionals;
  if (!values.length) throw usageError('Informe ao menos um arquivo ou URL.');
  if (action === 'upload') {
    const result = await uploadLocalFiles(ctx, values);
    return output(ctx, result, () => result.items.forEach((item) => stdout(`${item.url}  ← ${item.path}`)));
  }
  if (action === 'import') {
    const result = await callTool(ctx, 'import_media_from_url', { urls: values });
    return output(ctx, result, () => {
      for (const item of result.items || []) stdout(`${item.url}  ← ${item.sourceUrl}`);
      for (const error of result.errors || []) stderr(`Falhou: ${error.sourceUrl}: ${error.message}`);
    });
  }
  throw usageError('Use "media upload <arquivos>" ou "media import <urls>".');
}

async function commandPostList(ctx: Context, flags: Flags, defaults: { from?: string; to?: string } = {}) {
  const args: Record<string, unknown> = { limit: flagInt(flags, 'limit') ?? 50 };
  const status = flagString(flags, 'status');
  if (status) args.status = status.toUpperCase();
  const account = flagString(flags, 'account');
  if (account) args.accountId = await resolveAccount(ctx, account, 'instagram', true);
  const platform = flagString(flags, 'platform');
  if (platform) args.platform = parsePlatforms([platform])[0];
  const from = flagString(flags, 'from') ? parseDateTimeArg(flagString(flags, 'from') as string) : defaults.from;
  const to = flagString(flags, 'to') ? parseDateTimeArg(flagString(flags, 'to') as string) : defaults.to;
  if (from) args.from = from;
  if (to) args.to = to;
  const search = flagString(flags, 'search');
  if (search) args.search = search;
  const result = await callTool(ctx, 'list_posts', args);
  output(ctx, result, () => {
    if (!result.posts.length) return stdout('Nenhuma publicação encontrada.');
    let day = '';
    for (const post of result.posts) {
      const current = new Date(post.scheduledFor).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
      if (defaults.from && current !== day) { day = current; stdout(`\n${current}`); }
      printPostLine(post);
    }
    if (result.truncated) stdout(`… mais ${result.total - result.posts.length} publicações (use --limit).`);
  });
}

async function commandPosts(ctx: Context, positionals: string[], flags: Flags) {
  const [action = 'list', id] = positionals;
  if (action === 'list') return commandPostList(ctx, flags);
  if (action === 'create') {
    const args = await postArgsFromFlags(ctx, flags, 'create');
    const schedule = flagBool(flags, 'schedule');
    if (schedule && !args.scheduledFor) throw usageError('Para agendar, informe --at com a data e hora.');
    if (!args.scheduledFor) args.scheduledFor = toLocalIsoWithOffset(new Date(Date.now() + 60 * 60_000));
    args.status = schedule ? 'SCHEDULED' : 'DRAFT';
    const result = await callTool(ctx, 'create_post', args);
    return output(ctx, result, () => { printPost(result.post); stdout(`\n${result.next}`); });
  }
  if (action === 'locations') {
    const query = positionals.slice(1).join(' ').trim();
    if (!query) throw usageError('Informe o nome do local: instacommand posts locations "Parque Ibirapuera"');
    const accountId = await resolveAccount(ctx, flagString(flags, 'account'), 'instagram', true);
    const result = await callTool(ctx, 'locations_search', { accountId, query });
    return output(ctx, result, () => {
      if (result.message) stdout(result.message);
      for (const item of result.items || []) stdout(`${item.id}  ${item.name}${item.city ? ` — ${[item.city, item.state, item.country].filter(Boolean).join(', ')}` : ''}`);
    });
  }
  if (!id) throw usageError(`Informe o ID da publicação: instacommand posts ${action} <id>`);
  if (action === 'get') {
    const post = await callTool(ctx, 'get_post', { postId: id });
    return output(ctx, post, () => printPost(post));
  }
  if (action === 'update') {
    const existing = flagString(flags, 'location-search') ? await callTool(ctx, 'get_post', { postId: id }) : null;
    const args = await postArgsFromFlags(ctx, flags, 'update', id, existing?.accountId);
    if (flagBool(flags, 'schedule')) args.status = 'SCHEDULED';
    if (flagBool(flags, 'draft')) args.status = 'DRAFT';
    const result = await callTool(ctx, 'update_post', { postId: id, ...args });
    return output(ctx, result, () => printPost(result.post));
  }
  if (action === 'schedule') {
    const at = flagString(flags, 'at');
    if (!at) throw usageError('Informe --at com a data e hora.');
    const result = await callTool(ctx, 'schedule_post', { postId: id, scheduledFor: parseDateTimeArg(at) });
    return output(ctx, result, () => { printPost(result.post); stdout(`\n${result.message}`); });
  }
  if (action === 'unschedule') {
    const result = await callTool(ctx, 'unschedule_post', { postId: id });
    return output(ctx, result, () => stdout(result.message));
  }
  if (action === 'publish') {
    requireYes(flags, 'Publicar agora');
    const mode = flagBool(flags, 'queue') ? 'queue' : flagBool(flags, 'wait') ? 'wait' : 'auto';
    const result = await callTool(ctx, 'publish_post_now', { postId: id, confirm: true, mode });
    return output(ctx, result, () => {
      if (result.queued) return stdout(`Na fila: publicação em ${formatDate(result.publishAt)}. Acompanhe com "instacommand posts get ${id}".`);
      const summary = result.publishSummary || {};
      if (summary.succeeded?.length) stdout(`Publicado em: ${summary.succeeded.join(', ')}`);
      for (const failure of summary.failed || []) stdout(`Falhou em ${failure.platform}: ${failure.message}`);
      for (const warning of summary.warnings || []) stdout(`Aviso (${warning.platform}): ${warning.message}`);
      if (result.published?.permalink) stdout(`Link: ${result.published.permalink}`);
    });
  }
  if (action === 'duplicate') {
    const at = flagString(flags, 'at');
    if (!at) throw usageError('Informe --at com a data do novo rascunho.');
    const args: Record<string, unknown> = { postId: id, scheduledFor: parseDateTimeArg(at) };
    if (flagString(flags, 'account')) args.accountId = await resolveAccount(ctx, flagString(flags, 'account'), 'instagram', true);
    if (flagList(flags, 'platforms').length) args.platforms = parsePlatforms(flagList(flags, 'platforms'));
    if (flagString(flags, 'threads-account')) args.threadsAccountId = await resolveAccount(ctx, flagString(flags, 'threads-account'), 'threads', true);
    const result = await callTool(ctx, 'duplicate_post', args);
    return output(ctx, result, () => printPost(result.post));
  }
  if (action === 'delete') {
    requireYes(flags, 'Excluir a publicação');
    const result = await callTool(ctx, 'delete_post', { postId: id, confirm: true });
    return output(ctx, result, () => { stdout(result.message || 'Publicação excluída.'); for (const warning of result.warnings || []) stdout(`Aviso: ${warning}`); });
  }
  throw usageError(`Ação desconhecida: posts ${action}`);
}

async function commandAnalytics(ctx: Context, positionals: string[], flags: Flags) {
  const [report = 'dashboard'] = positionals;
  const days = flagInt(flags, 'days') ?? 30;
  if (report === 'facebook') return printJson(await callTool(ctx, 'get_network_report', { network: 'facebook', accountId: await resolveAccount(ctx, flagString(flags, 'account'), 'instagram', true), days }));
  if (report === 'x') return printJson(await callTool(ctx, 'get_network_report', { network: 'x', accountId: await resolveAccount(ctx, flagString(flags, 'account') || flagString(flags, 'x-account'), 'x', true), days }));
  if (report === 'threads') return printJson(await callTool(ctx, 'get_network_report', { network: 'threads', accountId: await resolveAccount(ctx, flagString(flags, 'account') || flagString(flags, 'threads-account'), 'threads', true), days }));
  const args: Record<string, unknown> = { accountId: await resolveAccount(ctx, flagString(flags, 'account'), 'instagram', true), report, days };
  for (const key of ['mediaType', 'sortBy', 'audience']) { const value = flagString(flags, key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)); if (value) args[key] = key === 'mediaType' ? value.toUpperCase() : value; }
  if (flagInt(flags, 'page') !== undefined) args.page = flagInt(flags, 'page');
  if (flagInt(flags, 'limit') !== undefined) args.limit = flagInt(flags, 'limit');
  printJson(await callTool(ctx, 'get_instagram_analytics', args));
}

async function commandComments(ctx: Context, positionals: string[], flags: Flags) {
  const [action = 'list', commentId] = positionals;
  const accountId = await resolveAccount(ctx, flagString(flags, 'account'), 'instagram', true);
  if (action === 'list') {
    const result = await callTool(ctx, 'list_comments', { accountId });
    return output(ctx, result, () => {
      if (!result.comments?.length) return stdout('Nenhum comentário recente.');
      for (const comment of result.comments) stdout(`${formatDate(comment.timestamp).padEnd(17)} @${String(comment.username).padEnd(20)} ${String(comment.text).replace(/\s+/g, ' ').slice(0, 80)}\n${' '.repeat(18)}comentário ${comment.id} · mídia ${comment.mediaId}`);
    });
  }
  const mediaId = flagString(flags, 'media');
  if (!commentId || !mediaId) throw usageError(`Use "comments ${action} <commentId> --media <mediaId>".`);
  if (action === 'reply') {
    const message = flagString(flags, 'message');
    if (!message) throw usageError('Informe --message com a resposta.');
    requireYes(flags, 'Responder publicamente');
    return printJson(await callTool(ctx, 'reply_to_comment', { accountId, mediaId, commentId, message }));
  }
  if (action === 'delete') {
    requireYes(flags, 'Excluir o comentário');
    return printJson(await callTool(ctx, 'delete_comment', { accountId, mediaId, commentId, confirm: true }));
  }
  throw usageError(`Ação desconhecida: comments ${action}`);
}

async function commandAi(ctx: Context, positionals: string[], flags: Flags) {
  const [mode] = positionals;
  if (!['caption', 'plan', 'daily', 'audit', 'reply'].includes(mode)) throw usageError('Use "ai caption|plan|daily|audit|reply".');
  const args: Record<string, unknown> = { mode };
  const account = await resolveAccount(ctx, flagString(flags, 'account'), 'instagram', false);
  if (account) args.accountId = account;
  for (const key of ['topic', 'audience', 'tone', 'objective', 'caption', 'comment']) { const value = flagString(flags, key); if (value) args[key] = value; }
  const type = flagString(flags, 'type');
  if (type) args.mediaType = type.toUpperCase();
  if (flagList(flags, 'platforms').length) args.platforms = parsePlatforms(flagList(flags, 'platforms'));
  printJson(await callTool(ctx, 'generate_ai_content', args));
}

async function commandTools(ctx: Context) {
  const result = await mcpRequest(ctx, 'tools/list');
  const tools = [...(result?.tools || []), LOCAL_UPLOAD_TOOL];
  output(ctx, tools, () => {
    for (const tool of tools) stdout(`${String(tool.name).padEnd(32)} ${tool.title || ''}`);
    stdout('\nDetalhes e parâmetros: instacommand tools --json · Executar: instacommand call <ferramenta> chave=valor');
  });
}

async function main(argv: string[]) {
  const { positionals, flags } = parseArgv(argv);
  const [command, ...rest] = positionals;
  if (flagBool(flags, 'version') || command === 'version') return stdout(VERSION);
  if (!command || command === 'help' || (flagBool(flags, 'help') && command !== 'call')) return stdout(HELP);
  const ctx = resolveContext(flags);
  switch (command) {
    case 'login': return commandLogin(flags);
    case 'logout': return commandLogout(flags);
    case 'config': return commandConfig(rest, flags);
    case 'status': case 'whoami': return commandStatus(ctx);
    case 'accounts': case 'account': return commandAccounts(ctx, rest, flags);
    case 'media': return commandMedia(ctx, rest);
    case 'posts': case 'post': return commandPosts(ctx, rest, flags);
    case 'calendar': {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 8 * 86_400_000 - 1000);
      return commandPostList(ctx, flags, { from: toLocalIsoWithOffset(start), to: toLocalIsoWithOffset(end) });
    }
    case 'analytics': return commandAnalytics(ctx, rest, flags);
    case 'comments': return commandComments(ctx, rest, flags);
    case 'ai': return commandAi(ctx, rest, flags);
    case 'automations': {
      const accountFlag = flagString(flags, 'account');
      const platform = (flagString(flags, 'platform') || 'INSTAGRAM').toUpperCase();
      const accountId = await resolveAccount(ctx, accountFlag, platform === 'THREADS' ? 'threads' : 'instagram', true);
      return printJson(await callTool(ctx, 'get_automations', { accountId, platform }));
    }
    case 'tools': return commandTools(ctx);
    case 'call': {
      const [name, ...pairs] = rest;
      if (!name) throw usageError('Informe o nome da ferramenta: instacommand call <ferramenta> chave=valor');
      return printJson(await callTool(ctx, name, parseToolArgs(pairs, flags)));
    }
    case 'mcp': return runBridge(ctx);
    default: throw usageError(`Comando desconhecido: ${command}`);
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    stderr(error instanceof Error ? `Erro: ${error.message}` : String(error));
    process.exit(error instanceof CliError ? error.exitCode : 1);
  });
}
