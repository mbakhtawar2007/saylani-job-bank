import { NextResponse, type NextRequest } from 'next/server';
import { CORRELATION_HEADER, resolveCorrelationId } from '@/lib/http/correlation';
import { buildCsp } from '@/lib/http/csp';
import { isProtectedPath } from '@/lib/http/protected-routes';

// Better Auth's session cookie (the __Secure- variant is used over HTTPS). Only presence is
// checked here; importing better-auth into the edge bundle would pull in unused JWT code.
const SESSION_COOKIES = ['jb.session_token', '__Secure-jb.session_token'];

/**
 * 1. Tags every request with a correlation id.
 * 2. Fast-path guard: dashboard pages without a session cookie go to /login?next=…
 *    (authoritative session + role checks run in each dashboard layout and API route).
 * 3. CSP nonces (audit 2026-11-11, M-20): a fresh nonce per request. It is
 *    sent to the app as the `x-nonce` request header — Next.js applies it to
 *    its own inline scripts — and embedded in the CSP response header. The
 *    theme script in layout.tsx reads the same header. The nonce is 32 hex
 *    characters (a valid base64 nonce alphabet) and needs no Buffer, which
 *    keeps the edge bundle small.
 */
export function middleware(request: NextRequest) {
  const correlationId = resolveCorrelationId(request.headers.get(CORRELATION_HEADER));
  const { pathname, search } = request.nextUrl;
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const csp = buildCsp(nonce);

  const hasSession = SESSION_COOKIES.some((name) => Boolean(request.cookies.get(name)?.value));
  if (isProtectedPath(pathname) && !hasSession) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${search}`);
    const redirect = NextResponse.redirect(login);
    redirect.headers.set(CORRELATION_HEADER, correlationId);
    redirect.headers.set('Content-Security-Policy', csp);
    return redirect;
  }

  const headers = new Headers(request.headers);
  headers.set(CORRELATION_HEADER, correlationId);
  headers.set('x-nonce', nonce);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(CORRELATION_HEADER, correlationId);
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
