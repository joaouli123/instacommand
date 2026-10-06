import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { oauthIssuer } from '../config/mcp';

// Serves the dependency-free CLI with this server's URL embedded as default,
// so `node instacommand.cjs login` works without extra configuration.
const router = Router();
const CLI_PATH = path.join(__dirname, '..', 'cli', 'instacommand.js');
const PLACEHOLDER = '__INSTACOMMAND_DEFAULT_API_URL__';
let cached: { mtimeMs: number; body: string } | null = null;

// The URL lands inside a string literal of the served script; anything beyond
// plain URL characters keeps the placeholder (the CLI then asks for --api-url).
export const embeddableApiUrl = (url: string) => (/^https?:\/\/[A-Za-z0-9.\-:[\]_~%/]+$/.test(url) ? url : PLACEHOLDER);

router.get('/downloads/instacommand.cjs', (_req, res, next) => {
  try {
    const stat = fs.statSync(CLI_PATH);
    if (!cached || cached.mtimeMs !== stat.mtimeMs) {
      cached = { mtimeMs: stat.mtimeMs, body: fs.readFileSync(CLI_PATH, 'utf8').split(PLACEHOLDER).join(embeddableApiUrl(oauthIssuer())) };
    }
    res.set({
      'Content-Type': 'application/javascript; charset=utf-8',
      'Content-Disposition': 'attachment; filename="instacommand.cjs"',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    }).send(cached.body);
  } catch (error) {
    next(error);
  }
});

export default router;
