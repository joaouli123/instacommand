const PRODUCTION_BACKEND_ORIGIN = 'https://api-instacommand.179.198.98.63.sslip.io';

export const BACKEND_ORIGIN = (
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (process.env.NODE_ENV === 'production' ? PRODUCTION_BACKEND_ORIGIN : 'http://localhost:3001')
)
  .replace(/\/api\/?$/, '')
  .replace(/\/$/, '');
