/**
 * Next.js Middleware for Authentication
 *
 * Server-side auth resolution using cookies
 * Redirects to /login if not authenticated and login is required
 */
import { NextRequest, NextResponse } from 'next/server';

// Whitelisted routes that stay public (everything else requires auth when enabled)
const PUBLIC_ROUTES = [
  '/login',
  '/api',
  '/_next',
  '/favicon.ico',
  '/assets',
  '/public',
  '/static',
  '/robots.txt',
  '/sitemap.xml',
  '/auth/callback',
  '/auth/complete',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check if login is required by calling backend
  const baseUrl = process.env.SERVER_BASE_URL || 'http://localhost:8001';
  try {
    const loginRequiredRes = await fetch(`${baseUrl}/auth/login-required`, {
      headers: {
        'X-API-Key': process.env.DEEPWIKI_FRONTEND_API_KEY || ''
      },
      cache: 'no-store',  // Prevent Next.js from caching this request
      next: { revalidate: 0 }
    });

    if (!loginRequiredRes.ok) {
      // If we can't check login status, allow access
      return NextResponse.next();
    }

    const { required } = await loginRequiredRes.json();

    // If login not required, allow access
    if (!required) {
      return NextResponse.next();
    }

    // Login is required - check if user has token
    const token = request.cookies.get('dw_token');

    // If no token and not whitelisted, force login
    if (!token) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('returnUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Token exists but might be expired/invalid: validate against backend
    try {
      const authCheck = await fetch(`${baseUrl}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token.value}`,
          'X-API-Key': process.env.DEEPWIKI_FRONTEND_API_KEY || ''
        },
        cache: 'no-store',
        next: { revalidate: 0 }
      });

      if (authCheck.status === 401 || authCheck.status === 403) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('returnUrl', pathname);
        return NextResponse.redirect(loginUrl);
      }
    } catch (error) {
      // On validation failure (network/backend), keep existing fail-open behavior
      console.error('Auth validation error:', error);
    }

    return NextResponse.next();
  } catch (error) {
    console.error('Middleware error:', error);
    // On error, allow access (fail open)
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*$).*)',
  ],
};
