import { NextRequest, NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api-proxy';

/**
 * GET handler for job progress streaming
 * Proxies requests to backend with proper authentication
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

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

    // Use proxyToBackend to handle authentication
    const backendResponse = await proxyToBackend(
      `/api/wiki/jobs/${jobId}/progress/stream`,
      {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        }
      }
    );

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
        let isClosed = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            // Only enqueue if stream is still open
            if (!isClosed) {
              try {
                controller.enqueue(value);
              } catch (error) {
                // Controller closed by client - this is normal, stop reading
                if (error instanceof TypeError &&
                    'code' in error && error.code === 'ERR_INVALID_STATE') {
                  isClosed = true;
                  break;
                }
                throw error; // Re-throw other errors
              }
            }
          }
        } catch (error) {
          // Only log unexpected errors, not client disconnections or controller state issues
          if (error instanceof Error &&
              error.name !== 'AbortError' &&
              !('code' in error && error.code === 'ERR_INVALID_STATE')) {
            console.error(`[Job ${jobId}] Stream error:`, error.message);
          }

          // Try to signal error to client if controller is still open
          if (!isClosed) {
            try {
              controller.error(error);
              isClosed = true;
            } catch {
              // Controller already closed, ignore
            }
          }
        } finally {
          // Clean up reader
          reader.releaseLock();

          // Only close if not already closed
          if (!isClosed) {
            try {
              controller.close();
            } catch {
              // Controller already closed, ignore silently
            }
          }
        }
      },
      cancel() {
        // Client disconnected (e.g., closed browser tab) - this is normal behavior
        console.log(`[Job ${jobId}] Client disconnected from progress stream`);
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
