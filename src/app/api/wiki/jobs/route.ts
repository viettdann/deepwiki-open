import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api-proxy';

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

    const response = await proxyToBackend(`/api/wiki/jobs?${params}`, {
      method: 'GET'
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

    const response = await proxyToBackend('/api/wiki/jobs', {
      method: 'POST',
      body
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
