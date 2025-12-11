/**
 * Login API Route
 *
 * Authenticates user and sets HttpOnly cookie with JWT token
 */
import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api-proxy';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Forward to backend
    const response = await proxyToBackend('/auth/login', {
      method: 'POST',
      body
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();

    // Set HttpOnly cookie with JWT token
    const res = NextResponse.json({ user: data.user });

    res.cookies.set('dw_token', data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/'
    });

    return res;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    );
  }
}
