import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

// The MCP endpoint executes tools through the regular REST API over loopback,
// so every tool goes through exactly the same validation as the web app. OAuth
// tokens are audience-bound to the MCP resource; this per-process secret lets
// the REST layer recognize those internal calls without accepting the token
// from anywhere else. It never leaves this process.
export const MCP_PROXY_HEADER = 'x-instacommand-mcp-proxy';
export const mcpProxySecret = randomBytes(32).toString('hex');

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export const isTrustedMcpProxyRequest = (req: Pick<Request, 'get' | 'socket'>) => {
  const presented = req.get(MCP_PROXY_HEADER);
  if (!presented || !LOOPBACK.has(req.socket?.remoteAddress || '')) return false;
  const expected = Buffer.from(mcpProxySecret);
  const actual = Buffer.from(presented);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
