/**
 * Statistics API Route - Top Repos
 * Proxies to Python backend /api/statistics/top-repos
 */
import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api-proxy';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = searchParams.get('limit') || '10';

    const path = `/api/statistics/top-repos?limit=${limit}`;
    const response = await proxyToBackend(path, {
      method: 'GET'
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Statistics top-repos error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch top repositories' },
      { status: 500 }
    );
  }
}
