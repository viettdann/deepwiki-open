import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api-proxy';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const response = await proxyToBackend(`/api/wiki_cache?${params.toString()}`, {
      method: 'GET'
    });

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
    console.error('Error fetching wiki cache:', error);
    return NextResponse.json({ error: 'Failed to fetch wiki cache' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await proxyToBackend('/api/wiki_cache', {
      method: 'POST',
      body
    });

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
    console.error('Error saving wiki cache:', error);
    return NextResponse.json({ error: 'Failed to save wiki cache' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const response = await proxyToBackend(`/api/wiki_cache?${params.toString()}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      let errorBody: unknown = await response.text();
      try {
        errorBody = JSON.parse(errorBody as string);
      } catch {}
      return NextResponse.json(
        typeof errorBody === 'string' ? { error: errorBody } : errorBody as object,
        { status: response.status }
      );
    }

    const data = await response.json().catch(() => ({ message: 'Cache deleted' }));
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error deleting wiki cache:', error);
    return NextResponse.json({ error: 'Failed to delete wiki cache' }, { status: 500 });
  }
}
