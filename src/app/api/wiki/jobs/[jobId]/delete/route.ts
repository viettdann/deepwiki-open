import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api-proxy';

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

/**
 * POST /api/wiki/jobs/[jobId]/delete - Permanently delete a job
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;

    const response = await proxyToBackend(
      `/api/wiki/jobs/${jobId}/delete`,
      { method: 'POST' }
    );

    if (!response.ok) {
      let errorBody = { error: `Failed to delete job: ${response.statusText}` };
      try {
        errorBody = await response.json();
      } catch {}
      return NextResponse.json(errorBody, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: unknown) {
    console.error('Error deleting job:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: `Failed to delete job: ${message}` },
      { status: 500 }
    );
  }
}
