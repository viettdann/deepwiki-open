import { NextRequest, NextResponse } from 'next/server';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_HOST || 'http://localhost:8001';
const API_KEY = process.env.DEEPWIKI_FRONTEND_API_KEY || '';

interface RouteParams {
  params: Promise<{ jobId: string; pageId: string }>;
}

/**
 * POST /api/wiki/jobs/[jobId]/pages/[pageId]/retry - Retry a failed page
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { jobId, pageId } = await params;
    const url = `${PYTHON_BACKEND_URL}/api/wiki/jobs/${jobId}/pages/${pageId}/retry${API_KEY ? `?api_key=${encodeURIComponent(API_KEY)}` : ''}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { 'X-API-Key': API_KEY } : {})
      },
    });

    if (!response.ok) {
      let errorBody = { error: `Failed to retry page: ${response.statusText}` };
      try {
        errorBody = await response.json();
      } catch {}
      return NextResponse.json(errorBody, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: unknown) {
    console.error('Error retrying page:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: `Failed to retry page: ${message}` },
      { status: 500 }
    );
  }
}
