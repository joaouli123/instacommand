import { env } from '../config/env';

export const publicMediaBase = () => {
  const base = env.MEDIA_PUBLIC_URL.replace(/\/$/, '');
  // An HTTPS application cannot embed HTTP media. Do not trust a forwarded
  // Host header to construct URLs; use the configured public media origin.
  return env.FRONTEND_URL.startsWith('https://') ? base.replace(/^http:\/\//, 'https://') : base;
};

export const normalizeMediaUrl = (url: string) => {
  const legacy = env.MEDIA_PUBLIC_URL.replace(/\/$/, '');
  return url.startsWith(`${legacy}/`) ? `${publicMediaBase()}${url.slice(legacy.length)}` : url;
};

export const publicMediaHeaders = (res: { setHeader: (name: string, value: string) => unknown }) => {
  // Only already-public upload files are embeddable by the separate frontend
  // and retrievable by Meta. Keep Helmet's default policy on API responses.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
};
