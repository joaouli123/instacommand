import express, { Router, type Request, type Response } from 'express';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isMcpResource, protectedResourceMetadataUrl } from '../config/mcp';
import { getApiTokenFromRequest } from '../middleware/auth';
import { verifyApiToken, type VerifiedApiToken } from '../services/api-tokens.service';
import { API_SCOPES } from '../services/api-scopes';
import { createInternalApi } from '../mcp/internal-api';
import { createMcpServer } from '../mcp/server';

// Remote MCP endpoint (Streamable HTTP, stateless JSON responses). Bearer
// tokens only, never cookies, so it may be called from any origin.
const router = Router();
router.use('/mcp', cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'MCP-Protocol-Version', 'Mcp-Session-Id', 'Last-Event-ID'],
  exposedHeaders: ['WWW-Authenticate', 'Mcp-Session-Id', 'MCP-Protocol-Version'],
  maxAge: 600,
}));

type McpCredential = { secret: string; token: VerifiedApiToken };

async function resolveCredential(req: Request): Promise<McpCredential | 'missing' | 'invalid'> {
  const secret = getApiTokenFromRequest(req);
  if (!secret) return 'missing';
  const token = await verifyApiToken(secret);
  // OAuth tokens must have been issued for this exact resource (RFC 8707).
  if (!token || (token.resource !== null && !isMcpResource(token.resource)) || !token.scopes.length) return 'invalid';
  return { secret, token };
}

const challenge = (res: Response, invalid: boolean) => {
  const parts = [
    'Bearer realm="InstaCommand"',
    `resource_metadata="${protectedResourceMetadataUrl()}"`,
    `scope="${API_SCOPES.join(' ')}"`,
    ...(invalid ? ['error="invalid_token"', 'error_description="Token inválido, expirado ou revogado"'] : []),
  ];
  res.status(401).set('WWW-Authenticate', parts.join(', ')).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: invalid ? 'Token inválido, expirado ou revogado. Conecte o InstaCommand novamente.' : 'Autenticação necessária.' },
    id: null,
  });
};

const methodNotAllowed = (res: Response) => res.status(405).set('Allow', 'POST').json({
  jsonrpc: '2.0', error: { code: -32000, message: 'Este servidor MCP é stateless: use POST.' }, id: null,
});

router.post('/mcp', express.json({ limit: '25mb' }), async (req: Request, res: Response) => {
  const credential = await resolveCredential(req).catch(() => 'invalid' as const);
  if (credential === 'missing' || credential === 'invalid') return challenge(res, credential === 'invalid');

  const { token, secret } = credential;
  const server = createMcpServer({
    api: createInternalApi(secret),
    auth: { userId: token.userId, email: token.email, scopes: token.scopes, tokenKind: token.kind, tokenName: token.name, clientName: token.clientName },
  });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    void transport.close().catch(() => undefined);
    void server.close().catch(() => undefined);
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP request failed:', error instanceof Error ? error.message : error);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Erro interno do servidor MCP.' }, id: null });
  }
});

// Clients may probe GET for a server-initiated SSE stream; an unauthenticated
// probe still gets the challenge that starts OAuth discovery.
router.get('/mcp', async (req: Request, res: Response) => {
  const credential = await resolveCredential(req).catch(() => 'invalid' as const);
  if (credential === 'missing' || credential === 'invalid') return challenge(res, credential === 'invalid');
  return methodNotAllowed(res);
});

router.delete('/mcp', (_req: Request, res: Response) => methodNotAllowed(res));

router.use('/mcp', (error: any, _req: Request, res: Response, next: express.NextFunction) => {
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ jsonrpc: '2.0', error: { code: -32700, message: 'JSON inválido.' }, id: null });
  if (error?.type === 'entity.too.large') return res.status(413).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Requisição maior que 25 MB.' }, id: null });
  return next(error);
});

export default router;
