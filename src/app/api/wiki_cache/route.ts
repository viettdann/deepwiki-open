import { NextRequest, NextResponse } from 'next/server';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_HOST || 'http://localhost:8001';
const API_KEY = process.env.DEEPWIKI_FRONTEND_API_KEY || '';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const url = `${PYTHON_BACKEND_URL}/api/wiki_cache?${params.toString()}${API_KEY ? `&api_key=${encodeURIComponent(API_KEY)}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(API_KEY ? { 'X-API-Key': API_KEY } : {})
      },
      cache: 'no-store',
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
    const url = `${PYTHON_BACKEND_URL}/api/wiki_cache${API_KEY ? `?api_key=${encodeURIComponent(API_KEY)}` : ''}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { 'X-API-Key': API_KEY } : {})
      },
      body: JSON.stringify(body),
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
    const params = await request.json();
    const query = new URLSearchParams(params);
    const url = `${PYTHON_BACKEND_URL}/api/wiki_cache?${query.toString()}${API_KEY ? `&api_key=${encodeURIComponent(API_KEY)}` : ''}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        ...(API_KEY ? { 'X-API-Key': API_KEY } : {})
      },
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

    const data = await response.json().catch(() => ({ message: 'Cache deleted' }));
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error deleting wiki cache:', error);
    return NextResponse.json({ error: 'Failed to delete wiki cache' }, { status: 500 });
  }
}
