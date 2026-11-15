import { proxyViewerRoute } from '../../viewer-proxy.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = proxyViewerRoute;
export const HEAD = proxyViewerRoute;
export const POST = proxyViewerRoute;
export const PUT = proxyViewerRoute;
export const DELETE = proxyViewerRoute;
