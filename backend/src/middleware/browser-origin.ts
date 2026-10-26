import type { RequestHandler } from 'express';

/** CORS controls response visibility, NOT whether a cookie-authenticated POST executes. */
export const browserOriginGuard = (allowed: ReadonlySet<string>): RequestHandler => (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if ((origin && !allowed.has(origin)) || (!origin && req.get('sec-fetch-site') === 'cross-site')) {
    res.status(403).json({ error: 'Origem da solicitação não permitida.' });
    return;
  }
  next();
};

/** Query strings, OAuth codes and public-link credentials must not enter access logs. */
export const safeRequestPath = (url: string) => url.split('?')[0].replace(/(\/api\/public\/share\/|\/share\/)[^/]+/gi, '$1[redacted]');
