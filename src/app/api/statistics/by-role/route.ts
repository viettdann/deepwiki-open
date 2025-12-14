/**
 * Statistics API Route - By Role
 * Proxies to Python backend /api/statistics/by-role
 */
import { NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api-proxy';

export async function GET() {
  try {
    const response = await proxyToBackend('/api/statistics/by-role', {
      method: 'GET'
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Statistics by-role error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch role statistics' },
      { status: 500 }
    );
  }
}
