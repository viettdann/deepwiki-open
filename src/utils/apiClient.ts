/**
 * API Client Utility for DeepWiki
 *
 * Provides helper functions for making authenticated API requests
 * using X-API-Key header authentication.
 */

const API_KEY = process.env.DEEPWIKI_FRONTEND_API_KEY || '';

/**
 * Fetch with API key authentication
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch options
 * @returns Promise<Response>
 */
export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);

  if (API_KEY) {
    headers.set('X-API-Key', API_KEY);
  }

  return fetch(url, { ...options, headers });
}

/**
 * Build WebSocket URL with API key as query parameter
 *
 * @param baseUrl - Base WebSocket URL
 * @param apiKey - Optional API key (uses env var if not provided)
 * @returns WebSocket URL with api_key query parameter
 */
export function buildWebSocketUrl(baseUrl: string, apiKey?: string): string {
  const key = apiKey || API_KEY;

  if (!key) {
    return baseUrl;
  }

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}api_key=${encodeURIComponent(key)}`;
}
