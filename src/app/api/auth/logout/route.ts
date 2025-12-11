/**
 * Logout API Route
 *
 * Clears authentication cookie (JWT is stateless)
 * Returns 204 No Content
 */
import { NextResponse } from 'next/server';

export async function POST() {
  const res = new NextResponse(null, { status: 204 });

  // Clear the JWT cookie
  res.cookies.set('dw_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/'
  });

  return res;
}
