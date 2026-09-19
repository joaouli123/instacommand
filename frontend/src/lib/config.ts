const PRODUCTION_BACKEND_ORIGIN = 'https://api-instacommand.179.198.98.63.sslip.io';

const configuredBackendOrigin = (
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (process.env.NODE_ENV === 'production' ? PRODUCTION_BACKEND_ORIGIN : 'http://localhost:3001')
)
  .replace(/\/api\/?$/, '')
  .replace(/\/$/, '');

// Production traffic must never use the HTTP API endpoint. Browsers reject
// credentialed CORS preflights when HTTP redirects to HTTPS.
export const BACKEND_ORIGIN = process.env.NODE_ENV === 'production'
  ? configuredBackendOrigin.replace(/^http:\/\//i, 'https://')
  : configuredBackendOrigin;
