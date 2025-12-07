/**
 * HTTP streaming client for chat completions
 */

import { buildApiUrl } from './apiClient';

// Get the server base URL from environment or use default
const SERVER_BASE_URL = process.env.NEXT_PUBLIC_SERVER_BASE_URL || 'http://localhost:8001';

const API_KEY = typeof window === 'undefined'
  ? process.env.DEEPWIKI_FRONTEND_API_KEY || ''
  : '';

// Build streaming API URL
const getStreamingUrl = () => {
  return buildApiUrl(`${SERVER_BASE_URL}/chat/completions/stream`, API_KEY);
};

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatCompletionRequest {
  repo_url: string;
  messages: ChatMessage[];
  filePath?: string;
  token?: string;
  type?: string;
  provider?: string;
  model?: string;
  language?: string;
  excluded_dirs?: string;
  excluded_files?: string;
  included_dirs?: string;
  included_files?: string;
}

export interface StreamingOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * Creates an HTTP streaming request for chat completions
 * @param request The chat completion request
 * @param onMessage Callback for received message chunks
 * @param onError Callback for errors
 * @param onClose Callback for when the stream completes
 * @param options Additional options for streaming
 * @returns Promise that resolves when streaming completes
 */
export const createStreamingRequest = async (
  request: ChatCompletionRequest,
  onMessage: (message: string) => void,
  onError: (error: Error) => void,
  onClose: () => void,
  options: StreamingOptions = {}
): Promise<void> => {
  const {
    timeout = 60000, // 60 seconds default timeout
    retries = 2,
    retryDelay = 1000
  } = options;

  let attempt = 0;

  const attemptRequest = async (): Promise<void> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeout);

      const response = await fetch(getStreamingUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify(request),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        try {
          const errorBody = await response.text();
          if (errorBody) {
            errorMessage += ` - ${errorBody}`;
          }
        } catch {
          // Ignore errors reading error body
        }

        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          if (chunk) {
            onMessage(chunk);
          }
        }
      } finally {
        reader.releaseLock();
        onClose();
      }

    } catch (error) {
      if (error instanceof Error) {
        // Retry on network errors but not on AbortError or 4xx errors
        if (attempt < retries &&
            !error.message.includes('AbortError') &&
            !error.message.match(/HTTP [45]\d\d/)) {
          attempt++;
          console.warn(`Streaming attempt ${attempt} failed, retrying in ${retryDelay}ms:`, error.message);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return attemptRequest();
        }

        onError(error);
      } else {
        onError(new Error('Unknown streaming error'));
      }
    }
  };

  return attemptRequest();
};

/**
 * Creates a streaming request with Promise-based interface
 * @param request The chat completion request
 * @param options Additional options for streaming
 * @returns Promise that resolves with the complete response
 */
export const createStreamingRequestPromise = (
  request: ChatCompletionRequest,
  options: StreamingOptions = {}
): Promise<string> => {
  return new Promise((resolve, reject) => {
    let fullResponse = '';

    createStreamingRequest(
      request,
      (chunk) => {
        fullResponse += chunk;
      },
      (error) => {
        reject(error);
      },
      () => {
        resolve(fullResponse);
      },
      options
    );
  });
};

