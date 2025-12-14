/**
 * Statistics API Route - Models
 * Proxies to Python backend /api/statistics/models
 */
import { NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api-proxy';

export async function GET() {
  try {
    const response = await proxyToBackend('/api/statistics/models', {
      method: 'GET'
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Statistics models error:', error);
    return NextResponse.json(
      { detail: 'Failed to fetch model statistics' },
      { status: 500 }
    );
  }
}
