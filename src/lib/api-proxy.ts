/**
 * API Proxy Utility
 *
 * Consolidates repeated fetch logic for route handlers
 * Handles JWT token from cookies and API key authentication
 */
import { cookies } from 'next/headers';

interface ProxyOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Proxy request to backend API with authentication
 *
 * @param path - Backend API path (without base URL)
 * @param options - Request options
 * @returns Backend response (pass-through)
 */
export async function proxyToBackend(
  path: string,
  options: ProxyOptions = {}
): Promise<Response> {
  const {
    method = 'GET',
    body,
    headers: additionalHeaders = {}
  } = options;

  // Get base URL from environment
  const baseUrl = process.env.SERVER_BASE_URL || 'http://localhost:8001';

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...additionalHeaders
  };

  // Add JWT token from cookie if present
  const cookieStore = await cookies();
  const token = cookieStore.get('dw_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token.value}`;
  }

  // Add API key if configured
  const apiKey = process.env.DEEPWIKI_FRONTEND_API_KEY;
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  // Build request options
  const requestOptions: RequestInit = {
    method,
    headers
  };

  if (body) {
    requestOptions.body = JSON.stringify(body);
  }

  // Make request to backend
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, requestOptions);

  return response;
}

/**
 * Proxy request to backend and return JSON
 */
export async function proxyToBackendJSON<T = unknown>(
  path: string,
  options: ProxyOptions = {}
): Promise<T> {
  const response = await proxyToBackend(path, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Backend error: ${response.status} ${error}`);
  }

  return response.json();
}
