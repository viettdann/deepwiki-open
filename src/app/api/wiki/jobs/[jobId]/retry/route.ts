import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api-proxy';

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;

    const response = await proxyToBackend(
      `/api/wiki/jobs/${jobId}/retry`,
      { method: 'POST' }
    );

    if (!response.ok) {
      let errorBody: unknown = { error: `Failed to retry job: ${response.statusText}` };
      try {
        errorBody = await response.json();
      } catch {}
      return NextResponse.json(
        typeof errorBody === 'string' ? { error: errorBody } : (errorBody as object),
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error retrying job:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: `Failed to retry job: ${message}` }, { status: 500 });
  }
}
