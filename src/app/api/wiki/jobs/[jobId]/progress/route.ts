import { NextRequest, NextResponse } from 'next/server';

// Backend server configuration
const TARGET_SERVER_BASE_URL = process.env.SERVER_BASE_URL || 'http://localhost:8001';
const API_KEY = process.env.DEEPWIKI_FRONTEND_API_KEY || '';

/**
 * GET handler for job progress streaming
 * Proxies requests to backend with server-side API key
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const jobId = params.jobId;

    if (!jobId) {
      return new NextResponse(
        JSON.stringify({ error: 'Job ID is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`Proxying job progress stream for job: ${jobId}`);

    const targetUrl = `${TARGET_SERVER_BASE_URL}/api/wiki/jobs/${jobId}/progress/stream`;

    // Make the request to the backend
    const backendResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...(API_KEY ? { 'X-API-Key': API_KEY } : {})
      },
    });

    // If backend returned an error, forward it to the client
    if (!backendResponse.ok) {
      const errorBody = await backendResponse.text();
      return new NextResponse(errorBody, {
        status: backendResponse.status,
        statusText: backendResponse.statusText,
        headers: {
          'Content-Type': backendResponse.headers.get('Content-Type') || 'application/json'
        }
      });
    }

    // Ensure the backend response has a body to stream
    if (!backendResponse.body) {
      return new NextResponse('Stream body from backend is null', { status: 500 });
    }

    // Create a ReadableStream to pipe data from backend to client
    const stream = new ReadableStream({
      async start(controller) {
        const reader = backendResponse.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            controller.enqueue(value);
          }
        } catch (error) {
          console.error('Error reading from backend stream:', error);
          controller.error(error);
        } finally {
          controller.close();
          reader.releaseLock();
        }
      },
      cancel(reason) {
        console.log('Client cancelled job progress stream:', reason);
      }
    });

    // Set up response headers
    const responseHeaders = new Headers();
    const contentType = backendResponse.headers.get('Content-Type');
    if (contentType) {
      responseHeaders.set('Content-Type', contentType);
    }
    responseHeaders.set('Cache-Control', 'no-cache, no-transform');
    responseHeaders.set('X-Accel-Buffering', 'no'); // Disable nginx buffering

    return new NextResponse(stream, {
      status: backendResponse.status,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error('Error in job progress stream proxy:', error);
    let errorMessage = 'Internal Server Error in proxy';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return new NextResponse(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
      'Access-Control-Max-Age': '86400', // Cache preflight for 24 hours
    },
  });
}
