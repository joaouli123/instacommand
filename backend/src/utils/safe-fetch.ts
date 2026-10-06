import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { ValidationError } from './errors';

// Outbound fetches of user-supplied URLs (media import, OAuth client metadata)
// must never reach the server's own network: loopback, private ranges, cloud
// metadata endpoints or the Docker network that hosts Postgres and Redis.
export class UnsafeUrlError extends ValidationError {}

const blockedRanges = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blockedRanges.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 23],
  ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) blockedRanges.addSubnet(address, prefix, 'ipv6');

/** Tests may point fetches at a local fixture server. Production code never changes this. */
export const safeFetchPolicy = { allowPrivateNetworks: false, allowAnyPort: false };

const mappedIpv4 = (address: string) => {
  const match = address.toLowerCase().match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (match) return match[1];
  const hex = address.toLowerCase().match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const high = parseInt(hex[1], 16);
  const low = parseInt(hex[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
};

export const isPublicIpAddress = (address: string): boolean => {
  const family = net.isIP(address);
  if (family === 4) return !blockedRanges.check(address, 'ipv4');
  if (family === 6) {
    const ipv4 = mappedIpv4(address);
    if (ipv4) return isPublicIpAddress(ipv4);
    return !blockedRanges.check(address, 'ipv6');
  }
  return false;
};

const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error, '', 4);
    const list = addresses as dns.LookupAddress[];
    if (!list.length) return callback(new UnsafeUrlError('O endereço não pôde ser resolvido.'), '', 4);
    if (!safeFetchPolicy.allowPrivateNetworks && list.some((entry) => !isPublicIpAddress(entry.address))) {
      return callback(new UnsafeUrlError('Este endereço aponta para uma rede privada e não pode ser acessado.'), '', 4);
    }
    if ((options as dns.LookupOptions)?.all) return (callback as any)(null, list);
    return callback(null, list[0].address, list[0].family);
  });
};

export type SafeFetchOptions = {
  allowHttp?: boolean;
  maxRedirects?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
};

const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);

export const assertFetchableUrl = (raw: string, allowHttp: boolean) => {
  let url: URL;
  try { url = new URL(raw); } catch { throw new UnsafeUrlError('Informe uma URL válida.'); }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new UnsafeUrlError(allowHttp ? 'Use uma URL http:// ou https://.' : 'Use uma URL https://.');
  }
  if (url.username || url.password) throw new UnsafeUrlError('URLs com usuário e senha não são aceitas.');
  if (!ALLOWED_PORTS.has(url.port) && !safeFetchPolicy.allowAnyPort) throw new UnsafeUrlError('Esta porta não é permitida para downloads.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !safeFetchPolicy.allowPrivateNetworks && !isPublicIpAddress(host)) {
    throw new UnsafeUrlError('Este endereço aponta para uma rede privada e não pode ser acessado.');
  }
  return url;
};

export type SafeResponse = { response: http.IncomingMessage; url: URL; abort: () => void };

/**
 * GET with manual redirect handling; every hop is re-validated, and the DNS
 * answer is checked at connect time so a rebinding host cannot slip through.
 */
export async function safeGet(raw: string, options: SafeFetchOptions = {}): Promise<SafeResponse> {
  const allowHttp = options.allowHttp ?? true;
  const maxRedirects = options.maxRedirects ?? 3;
  const timeoutMs = options.timeoutMs ?? 15_000;
  let current = assertFetchableUrl(raw, allowHttp);

  for (let hop = 0; ; hop++) {
    const result = await new Promise<SafeResponse>((resolve, reject) => {
      const client = current.protocol === 'https:' ? https : http;
      const request = client.get(current, {
        agent: false,
        lookup: guardedLookup,
        headers: { 'User-Agent': 'InstaCommand/1.0 (+media-import)', ...options.headers },
        timeout: timeoutMs,
      }, (response) => resolve({ response, url: current, abort: () => request.destroy() }));
      request.on('timeout', () => request.destroy(new UnsafeUrlError('O servidor de origem demorou demais para responder.')));
      request.on('error', (error) => reject(error instanceof UnsafeUrlError ? error : new UnsafeUrlError(`Não foi possível baixar a URL: ${error.message}`)));
    });

    const status = result.response.statusCode || 0;
    const location = result.response.headers.location;
    if (status >= 300 && status < 400 && location) {
      result.response.resume();
      result.abort();
      if (hop >= maxRedirects) throw new UnsafeUrlError('A URL redirecionou vezes demais.');
      current = assertFetchableUrl(new URL(location, current).toString(), allowHttp);
      continue;
    }
    return result;
  }
}

/** Reads a small response body fully, refusing anything larger than `maxBytes`. */
export async function readLimitedBody(response: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    response.destroy();
    throw new UnsafeUrlError('O arquivo é maior que o limite permitido.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response) {
    size += chunk.length;
    if (size > maxBytes) {
      response.destroy();
      throw new UnsafeUrlError('O arquivo é maior que o limite permitido.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
