import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api-proxy';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const queryString = params.toString();

    const response = await proxyToBackend(
      `/local_repo/structure${queryString ? `?${queryString}` : ''}`,
      { method: 'GET', cache: 'no-store' }
    );

    if (!response.ok) {
      let errorBody: unknown = await response.text();
      try {
        errorBody = await response.json();
      } catch {}
      return NextResponse.json(
        typeof errorBody === 'string' ? { error: errorBody } : errorBody as object,
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching local repo structure:', error);
    return NextResponse.json({ error: 'Failed to fetch local repo structure' }, { status: 500 });
  }
}
