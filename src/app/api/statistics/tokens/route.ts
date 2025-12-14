/**
 * Statistics API Route - Token Breakdown
 * Proxies to Python backend /api/statistics/tokens
 */
import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api-proxy';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'all';

    const response = await proxyToBackend(`/api/statistics/tokens?period=${period}`, {
      method: 'GET'
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Statistics tokens error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch token statistics' },
      { status: 500 }
    );
  }
}
