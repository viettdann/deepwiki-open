import { NextRequest, NextResponse } from 'next/server';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_HOST || 'http://localhost:8001';
const JOBS_API_ENDPOINT = `${PYTHON_BACKEND_URL}/api/wiki/jobs`;
const API_KEY = process.env.DEEPWIKI_FRONTEND_API_KEY || '';

/**
 * GET /api/wiki/jobs - List jobs with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const params = new URLSearchParams();

    // Forward query parameters
    ['owner', 'repo', 'status', 'limit', 'offset'].forEach(key => {
      const value = searchParams.get(key);
      if (value) params.append(key, value);
    });

    const url = `${JOBS_API_ENDPOINT}?${params}${API_KEY ? `&api_key=${encodeURIComponent(API_KEY)}` : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { 'X-API-Key': API_KEY } : {})
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      let errorBody = { error: `Failed to fetch jobs: ${response.statusText}` };
      try {
        errorBody = await response.json();
      } catch {}
      return NextResponse.json(errorBody, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: unknown) {
    console.error('Error fetching jobs:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: `Failed to connect to backend: ${message}` },
      { status: 503 }
    );
  }
}

/**
 * POST /api/wiki/jobs - Create a new job
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${JOBS_API_ENDPOINT}${API_KEY ? `?api_key=${encodeURIComponent(API_KEY)}` : ''}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { 'X-API-Key': API_KEY } : {})
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorBody = { error: `Failed to create job: ${response.statusText}` };
      try {
        errorBody = await response.json();
      } catch {}
      return NextResponse.json(errorBody, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: unknown) {
    console.error('Error creating job:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: `Failed to create job: ${message}` },
      { status: 500 }
    );
  }
}
