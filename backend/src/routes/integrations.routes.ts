import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { mcpResourceUrl, oauthIssuer, protectedResourceMetadataUrl } from '../config/mcp';
import { API_SCOPE_DETAILS, API_SCOPES } from '../services/api-scopes';
import { createPersonalToken, listApiTokens, MAX_PERSONAL_TOKENS, PERSONAL_TOKEN_DURATIONS, revokeApiToken } from '../services/api-tokens.service';
import { toolCatalog } from '../mcp/catalog';
import { MCP_SERVER_VERSION } from '../mcp/server';

// Credential management for the "MCP e CLI" page. The scope policy rejects
// API tokens on /api/integrations/*, so only the signed-in browser session
// can create, list or revoke tokens.
const router = Router();
router.use(authenticate);

router.get('/catalog', (_req, res) => {
  const issuer = oauthIssuer();
  res.json({
    serverVersion: MCP_SERVER_VERSION,
    urls: {
      mcp: mcpResourceUrl(),
      api: `${issuer}/api`,
      cliDownload: `${issuer}/downloads/instacommand.cjs`,
      authorizationServerMetadata: `${issuer}/.well-known/oauth-authorization-server`,
      protectedResourceMetadata: protectedResourceMetadataUrl(),
    },
    scopes: API_SCOPES.map((scope) => ({ id: scope, ...API_SCOPE_DETAILS[scope] })),
    tokenDurations: PERSONAL_TOKEN_DURATIONS,
    maxPersonalTokens: MAX_PERSONAL_TOKENS,
    ...toolCatalog(),
  });
});

router.get('/tokens', async (req: AuthRequest, res, next) => {
  try { res.json(await listApiTokens(req.user!.id)); } catch (error) { next(error); }
});

router.post('/tokens', async (req: AuthRequest, res, next) => {
  try { res.status(201).json(await createPersonalToken(req.user!.id, req.body)); } catch (error) { next(error); }
});

router.delete('/tokens/:id', async (req: AuthRequest, res, next) => {
  try {
    await revokeApiToken(req.user!.id, req.params.id);
    res.json({ message: 'Acesso revogado.' });
  } catch (error) { next(error); }
});

export default router;
