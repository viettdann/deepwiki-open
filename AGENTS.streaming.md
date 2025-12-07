# HTTP Streaming & Real-time Updates Documentation

## Overview

DeepWiki uses HTTP streaming for chat completions and WebSocket for job progress tracking. This hybrid approach was implemented in December 2025 (commit `f3d2105`) when the chat interface migrated from WebSocket to HTTP streaming for better compatibility and simpler architecture.

## HTTP Streaming for Chat Completions

### Backend Implementation

**Endpoint:** `POST /chat/completions/stream`
**Location:** `api/simple_chat.py`

#### Request Format
```json
{
  "repo_url": "https://github.com/owner/repo",
  "messages": [
    {"role": "user", "content": "What does this code do?"}
  ],
  "provider": "google",
  "model": "gemini-2.0-flash",
  "language": "en",
  "filePath": null,
  "token": null,
  "type": "github",
  "excluded_dirs": null,
  "excluded_files": null,
  "included_dirs": null,
  "included_files": null
}
```

#### Streaming Implementation

**Response Type:** `StreamingResponse` with `media_type="text/event-stream"`

**Provider-Specific Streaming:**

```python
async def response_stream():
    try:
        if request.provider == "ollama":
            async for chunk in response:
                yield chunk.text
        elif request.provider == "openrouter":
            async for chunk in response:
                yield chunk
        else:  # Google Generative AI (default)
            for chunk in response:
                if hasattr(chunk, 'text'):
                    yield chunk.text
    except Exception as e:
        # Token limit fallback - retry without context
        logger.warning("Retrying without context due to error")
        # Simplified prompt streaming
```

**Key Features:**
- Real-time token streaming with chunked transfer encoding
- Multi-provider support (Google, OpenAI, OpenRouter, Ollama, DeepSeek)
- Deep Research mode with `[DEEP RESEARCH]` tag detection
- RAG integration with document retrieval
- Automatic fallback on token limit errors
- Conversation history management

### Frontend Implementation

**Client:** `src/utils/streamingClient.ts`

#### Core Streaming Function

```typescript
export const createStreamingRequest = async (
  request: ChatCompletionRequest,
  onMessage: (message: string) => void,
  onError: (error: Error) => void,
  onClose: () => void,
  options: StreamingOptions = {}
): Promise<void> => {
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

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    if (chunk) {
      onMessage(chunk);  // Callback for each chunk
    }
  }
}
```

**Features:**
- Automatic retry logic (default: 2 retries, 1000ms delay)
- Configurable timeout (default: 60000ms)
- AbortController for cancellation
- Error recovery with exponential backoff
- Stream decoding with TextDecoder
- Smart retry logic (skips 4xx errors and aborts)

#### Next.js API Route Proxy

**Location:** `src/app/api/chat/stream/route.ts`

Proxies requests from Next.js to the backend:

```typescript
export async function POST(req: NextRequest) {
  const requestBody = await req.json();

  const backendResponse = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      ...(API_KEY ? { 'X-API-Key': API_KEY } : {})
    },
    body: JSON.stringify(requestBody),
  });

  // Pipe backend stream to client
  const stream = new ReadableStream({
    async start(controller) {
      const reader = backendResponse.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        controller.close();
        reader.releaseLock();
      }
    }
  });

  return new NextResponse(stream, {
    status: backendResponse.status,
    headers: { 'Cache-Control': 'no-cache, no-transform' }
  });
}
```

### Chat Component Integration

**Location:** `src/components/Ask.tsx`

```typescript
let fullResponse = '';

await createStreamingRequest(
  requestBody,
  // Message handler - called for each chunk
  (message: string) => {
    fullResponse += message;
    setResponse(fullResponse);

    // Extract research stages for deep research
    if (deepResearch) {
      const stage = extractResearchStage(fullResponse, iteration);
      if (stage) {
        setResearchStages(prev => [...prev, stage]);
      }
    }
  },
  // Error handler
  (error: Error) => {
    console.error('Streaming error:', error);
    setResponse(prev => prev + `\n\nError: ${error.message}`);
  },
  // Close handler
  () => {
    const isComplete = checkIfResearchComplete(fullResponse);
    setResearchComplete(isComplete);
    setIsLoading(false);
  }
);
```

## WebSocket for Job Progress

WebSocket is still used for real-time job progress updates. This provides bidirectional communication for long-running wiki generation jobs.

### Backend WebSocket Endpoint

**Endpoint:** `WS /api/wiki/jobs/{job_id}/progress`
**Location:** `api/routes/jobs.py` - `job_progress_websocket()`

#### Authentication
- Requires API key via query parameter: `?api_key=YOUR_API_KEY`
- Validates job ownership implicitly

#### Message Protocol

**Progress Update Format:**
```json
{
  "job_id": "uuid-string",
  "status": "generating_pages",
  "current_phase": 2,
  "progress_percent": 35.0,
  "message": "Generating authentication page",
  "page_id": "page-uuid",
  "page_title": "Authentication",
  "total_pages": 20,
  "completed_pages": 7,
  "failed_pages": 1
}
```

**Heartbeat Message (every 30s):**
```json
{
  "heartbeat": true
}
```

**Final Status:**
```json
{
  "job_id": "uuid-string",
  "status": "completed",
  "current_phase": 3,
  "progress_percent": 100.0,
  "message": "Wiki generation completed",
  "total_pages": 20,
  "completed_pages": 19,
  "failed_pages": 1
}
```

### Frontend WebSocket Usage

**Location:** `src/app/wiki/job/[jobId]/page.tsx`

```typescript
useEffect(() => {
  if (!jobId) return;

  const wsUrl = `ws://localhost:8001/api/wiki/jobs/${jobId}/progress?api_key=${apiKey}`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    const update = JSON.parse(event.data);
    setJobProgress(update);

    if (update.status === 'completed' || update.status === 'failed') {
      ws.close();
    }
  };

  ws.onerror = () => {
    console.error('WebSocket error');
  };

  return () => {
    ws.close();
  };
}, [jobId]);
```

## Migration from WebSocket to HTTP Streaming

### What Changed

**Commit:** `f3d2105` - "refactor(chat): replace websocket with http streaming implementation"

| Aspect | WebSocket | HTTP Streaming |
|--------|-----------|----------------|
| **Protocol** | Bidirectional persistent connection | Unidirectional HTTP response |
| **Connection Overhead** | Handshake + persistent connection | Single HTTP POST request |
| **Data Format** | Message-based (JSON) | Chunked text streaming |
| **Error Recovery** | Manual reconnection logic | Automatic retry with backoff |
| **Browser Support** | Requires WebSocket support | Universal HTTP support |
| **Proxying** | Special proxy handling needed | Standard HTTP proxy |
| **Complexity** | More event-driven handling | Simpler read/await patterns |

### Removed Files/Functions

**Previous WebSocket Chat Client** (deleted):
- `createChatWebSocket()` function
- WebSocket URL construction logic
- WebSocket fallback mechanisms

### Updated Files

1. **`src/utils/apiClient.ts`**
   - `buildWebSocketUrl()` → repurposed for general API URLs

2. **`src/utils/streamingClient.ts`** (NEW)
   - Complete HTTP streaming implementation
   - Replaces WebSocket client entirely

3. **`src/components/Ask.tsx`**
   - Removed WebSocket connection logic
   - Now uses `createStreamingRequest()` directly

4. **`src/app/[owner]/[repo]/page.tsx`**
   - Removed 90+ lines of WebSocket + fallback logic
   - Replaced with HTTP fetch + stream reading

5. **`.env.example`**
   - Added `NEXT_PUBLIC_DEEPWIKI_FRONTEND_API_KEY`

## Streaming Protocol Details

### HTTP Streaming Format

**Protocol:** HTTP/1.1 with chunked transfer encoding
**Content-Type:** `text/event-stream`
**Format:** Plain UTF-8 text chunks (not formal SSE)

**Why Not Formal SSE?**
- Simpler implementation (no event parsing needed)
- Client only needs accumulated text
- Same browser support as SSE
- Backend has full control over format

### Data Flow

```
Frontend (Ask.tsx)
    ↓
POST /api/chat/stream (Next.js Route Handler)
    ↓
Proxy to Backend (http://localhost:8001/chat/completions/stream)
    ↓
Backend HTTP Response with streaming body
    ↓
ReadableStream → TextDecoder
    ↓
onMessage callback with chunks
    ↓
UI updates in real-time
```

## Deep Research Mode

### Activation
Add `[DEEP RESEARCH]` prefix to message content:

```json
{
  "messages": [
    {
      "role": "user",
      "content": "[DEEP RESEARCH] Analyze the authentication architecture"
    }
  ]
}
```

### Multi-Iteration Flow
1. **Iteration 0:** Research Plan
2. **Iterations 1-4:** Research Updates
3. **Final:** Conclusion

### Completion Detection
- Regex patterns: `## Final Conclusion`, `## Conclusion`
- Phrases: "This concludes our research"
- Auto-continue between iterations with 2-second delay

## Error Handling

### HTTP Streaming Errors

1. **Token Limit Exceeded**
   - Automatic retry without RAG context
   - User notification about constraints

2. **Network Errors**
   - Retry with exponential backoff
   - Max retries: 2 (configurable)

3. **Timeout**
   - 60-second timeout (configurable)
   - AbortController cancellation

4. **Provider Errors**
   - Informative error messages
   - Missing API key detection

### WebSocket Errors

1. **Authentication Failures**
   - Status code: 1008 (Policy Violation)
   - Messages: "Missing API key", "Invalid API key"

2. **Connection Timeouts**
   - 30-second heartbeat intervals
   - Automatic reconnection in some cases

## Performance Optimizations

### HTTP Streaming Benefits

1. **Simpler Architecture**
   - No persistent connections to manage
   - Single request/response cycle
   - Standard HTTP infrastructure

2. **Better Proxying**
   - Works through standard HTTP proxies
   - No special WebSocket proxy rules
   - Nginx/Apache handle naturally

3. **Stateless**
   - Server doesn't maintain connection state
   - Easier horizontal scaling
   - Natural load balancing

4. **Built-in Retry**
   - Automatic retry with configurable backoff
   - HTTP status codes for error handling
   - Clear error semantics

## Configuration

### Environment Variables

```bash
# Backend
NEXT_PUBLIC_SERVER_BASE_URL=http://localhost:8001
DEEPWIKI_FRONTEND_API_KEY=your_frontend_api_key

# Authentication
DEEPWIKI_API_KEY_AUTH_ENABLED=true
DEEPWIKI_BACKEND_API_KEYS=key1,key2,key3

# CORS Origins
DEEPWIKI_ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

### Streaming Options

| Parameter | Description | Default |
|-----------|-------------|---------|
| `timeout` | Request timeout | 60000ms |
| `retries` | Max retry attempts | 2 |
| `retryDelay` | Delay between retries | 1000ms |

## Security Considerations

### API Key Authentication
- Header: `X-API-Key: your-api-key`
- Query parameter: `?api_key=your-api-key` (WebSocket only)

### Public Endpoints (No API Key)
- `GET /` - Root endpoint
- `GET /health` - Health check
- `GET /auth/status` - Auth status

### Protected Endpoints (API Key Required)
- `POST /chat/completions/stream` - Chat streaming
- `WS /api/wiki/jobs/{job_id}/progress` - Job progress
- All `/api/*` endpoints

## Troubleshooting

### Common Issues

1. **No Streaming Response**
   - Check provider API keys
   - Verify repository accessibility
   - Check console for errors

2. **Connection Drops**
   - Check network stability
   - Monitor timeout settings
   - Review server logs

3. **Authentication Failed**
   - Verify API key is valid
   - Check environment variables
   - Ensure proper URL encoding

### Debug Commands

```bash
# Check API server status
curl http://localhost:8001/health

# Test streaming endpoint
curl -X POST http://localhost:8001/chat/completions/stream \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"repo_url":"https://github.com/user/repo","messages":[{"role":"user","content":"test"}],"provider":"google"}'

# View server logs
tail -f api/logs/application.log
```

## Best Practices

### Connection Management
- Close streams when components unmount
- Use AbortController for cancellation
- Implement proper error boundaries

### Message Handling
- Process streaming chunks incrementally
- Handle incomplete data gracefully
- Validate incoming data structure

### Performance
- Implement connection pooling for multiple requests
- Use debouncing for rapid-fire messages
- Cache frequently used data

## References

- **Backend Implementation:** `api/simple_chat.py`
- **Frontend Client:** `src/utils/streamingClient.ts`
- **API Proxy:** `src/app/api/chat/stream/route.ts`
- **Chat Component:** `src/components/Ask.tsx`
- **Job Progress WebSocket:** `api/routes/jobs.py`
