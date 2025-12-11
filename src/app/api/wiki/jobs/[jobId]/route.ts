import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api-proxy';

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

/**
 * GET /api/wiki/jobs/[jobId] - Get job details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;

    const response = await proxyToBackend(
      `/api/wiki/jobs/${jobId}`,
      { method: 'GET', cache: 'no-store' }
    );

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

    const response = await proxyToBackend(
      `/api/wiki/jobs/${jobId}`,
      { method: 'DELETE' }
    );

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
