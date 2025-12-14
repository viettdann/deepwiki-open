/**
 * Statistics API Route - By User
 * Proxies to Python backend /api/statistics/by-user
 */
import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api-proxy';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sort = searchParams.get('sort') || 'tokens';
    const order = searchParams.get('order') || 'desc';
    const limit = searchParams.get('limit') || '50';

    const path = `/api/statistics/by-user?sort=${sort}&order=${order}&limit=${limit}`;
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
    console.error('Statistics by-user error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch user statistics' },
      { status: 500 }
    );
  }
}
