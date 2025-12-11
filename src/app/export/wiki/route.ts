import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api-proxy';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await proxyToBackend('/export/wiki', {
      method: 'POST',
      body
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new NextResponse(errorText || 'Export failed', { status: response.status });
    }

    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    const contentDisposition = response.headers.get('Content-Disposition') || '';
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        ...(contentDisposition ? { 'Content-Disposition': contentDisposition } : {}),
      },
    });
  } catch (error) {
    console.error('Error exporting wiki via proxy:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
