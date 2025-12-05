import { NextRequest, NextResponse } from 'next/server';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_HOST || 'http://localhost:8001';

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

/**
 * GET /api/wiki/jobs/[jobId] - Get job details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const url = `${PYTHON_BACKEND_URL}/api/wiki/jobs/${jobId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!response.ok) {
      let errorBody = { error: `Failed to fetch job: ${response.statusText}` };
      try {
        errorBody = await response.json();
      } catch {}
      return NextResponse.json(errorBody, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: unknown) {
    console.error('Error fetching job:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: `Failed to fetch job: ${message}` },
      { status: 503 }
    );
  }
}

/**
 * DELETE /api/wiki/jobs/[jobId] - Cancel a job
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    const url = `${PYTHON_BACKEND_URL}/api/wiki/jobs/${jobId}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      let errorBody = { error: `Failed to cancel job: ${response.statusText}` };
      try {
        errorBody = await response.json();
      } catch {}
      return NextResponse.json(errorBody, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: unknown) {
    console.error('Error cancelling job:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: `Failed to cancel job: ${message}` },
      { status: 500 }
    );
  }
}
