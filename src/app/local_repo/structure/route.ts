import { NextRequest, NextResponse } from 'next/server';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_HOST || 'http://localhost:8001';
const API_KEY = process.env.DEEPWIKI_FRONTEND_API_KEY || '';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const url = `${PYTHON_BACKEND_URL}/local_repo/structure?${params.toString()}${API_KEY ? `&api_key=${encodeURIComponent(API_KEY)}` : ''}`;

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
    console.error('Error fetching local repo structure:', error);
    return NextResponse.json({ error: 'Failed to fetch local repo structure' }, { status: 500 });
  }
}
