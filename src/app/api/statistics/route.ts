/**
 * Statistics API Route - Overview
 * Proxies to Python backend /api/statistics/overview
 */
import { NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api-proxy';

export async function GET() {
  try {
    const response = await proxyToBackend('/api/statistics/overview', {
      method: 'GET'
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Statistics overview error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}
