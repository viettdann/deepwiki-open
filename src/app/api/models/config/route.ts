import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const TARGET_SERVER_BASE_URL = process.env.SERVER_BASE_URL || 'http://localhost:8001';
const API_KEY = process.env.DEEPWIKI_FRONTEND_API_KEY || '';

export async function GET() {
  try {
    const targetUrl = `${TARGET_SERVER_BASE_URL}/models/config`;

    // Forward user JWT (if present) so backend can enforce allowlist
    const cookieStore = await cookies();
    const token = cookieStore.get('dw_token');

    const backendResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
        ...(token ? { 'Authorization': `Bearer ${token.value}` } : {}),
      }
    });

    if (!backendResponse.ok) {
      return NextResponse.json(
        { error: `Backend service responded with status: ${backendResponse.status}` },
        { status: backendResponse.status }
      );
    }

    const modelConfig = await backendResponse.json();
    return NextResponse.json(modelConfig);
  } catch (error) {
    console.error('Error fetching model configurations:', error);
    return new NextResponse(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Handle OPTIONS requests for CORS if needed
export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    },
  });
}
