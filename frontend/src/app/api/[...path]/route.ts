import { proxyBrowserApi } from '@/lib/browser-api-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handle = (request: Request) => proxyBrowserApi(request);
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
