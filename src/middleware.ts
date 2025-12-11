/**
 * Next.js Middleware for Authentication
 *
 * Server-side auth resolution using cookies
 * Redirects to /login if not authenticated and login is required
 */
import { NextRequest, NextResponse } from 'next/server';

// Protected routes that require authentication
const PROTECTED_ROUTES = [
  '/',
  '/jobs'
];

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/login',
  '/api',
  '/_next',
  '/favicon.ico'
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

    // Check if route is protected
    const isProtectedRoute = PROTECTED_ROUTES.some(route => {
      if (route === '/') {
        return pathname === '/';
      }
      return pathname.startsWith(route);
    });

    if (isProtectedRoute && !token) {
      // Redirect to login with return URL
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('returnUrl', pathname);
      return NextResponse.redirect(loginUrl);
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
