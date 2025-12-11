/**
 * Login Required Check API Route
 *
 * Returns whether login is required
 */
import { NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api-proxy';

export async function GET() {
  try {
    const response = await proxyToBackend('/auth/login-required', {
      method: 'GET'
    });

    if (!response.ok) {
      return NextResponse.json({ required: false });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Login required check error:', error);
    return NextResponse.json({ required: false });
  }
}
