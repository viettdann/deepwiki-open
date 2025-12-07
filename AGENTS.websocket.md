# WebSocket Documentation for DeepWiki

## Overview

The DeepWiki project implements WebSocket functionality for real-time, bidirectional communication between the frontend and backend. This documentation covers all WebSocket endpoints, protocols, and integration patterns used throughout the application.

## WebSocket Endpoints

### 1. Chat Completion WebSocket (`/ws/chat`)

**Location:** `api/websocket_wiki.py` - `handle_websocket_chat()`

#### Purpose
- Primary endpoint for real-time chat completions with AI models
- Supports streaming responses from various LLM providers
- Handles RAG (Retrieval Augmented Generation) requests
- Implements deep research functionality with multi-turn conversations

#### Connection Establishment
```typescript
// URL Format
ws://localhost:8001/ws/chat?api_key=YOUR_API_KEY

// Or for production
wss://your-domain.com/ws/chat?api_key=YOUR_API_KEY
```

#### Authentication
- API key required via query parameter `api_key`
- Validates against `DEEPWIKI_BACKEND_API_KEYS` environment variable
- Uses same authentication as REST API endpoints

#### Message Protocol

**Client Request Format:**
```json
{
  "repo_url": "https://github.com/owner/repo",
  "messages": [
    {
      "role": "user",
      "content": "What is this repository about?"
    }
  ],
  "filePath": "/path/to/file.ts", // Optional
  "token": "github_pat_...", // Optional for private repos
  "type": "github", // github, gitlab, bitbucket
  "provider": "google", // google, openai, openrouter, ollama, deepseek
  "model": "gemini-2.5-flash", // Optional
  "language": "en",
  "excluded_dirs": "node_modules,vendor", // Optional
  "excluded_files": "*.test.js,*.spec.js", // Optional
  "included_dirs": "src,lib", // Optional
  "included_files": "*.ts,*.tsx" // Optional
}
```

**Server Response Format:**
- Streaming text responses
- Messages sent as plain text chunks
- Connection closes automatically when streaming completes

#### Supported Providers
- **Google Gemini**: Native streaming support
- **OpenAI**: Compatible with OpenAI API format
- **OpenRouter**: Compatible with OpenAI API format
- **DeepSeek**: Compatible with OpenAI API format
- **Ollama**: Local model support

#### Deep Research Feature
Add `[DEEP RESEARCH]` prefix to enable multi-turn research:
```json
{
  "messages": [
    {
      "role": "user",
      "content": "[DEEP RESEARCH] Analyze the architecture"
    }
  ]
}
```

#### Error Handling
- Token limit errors (automatically retries without context)
- Invalid API keys (immediate closure)
- Repository access issues (informative error messages)
- Connection timeouts (handled gracefully)

---

### 2. Job Progress WebSocket (`/api/wiki/jobs/{job_id}/progress`)

**Location:** `api/routes/jobs.py` - `job_progress_websocket()`

#### Purpose
- Real-time progress updates for wiki generation jobs
- Tracks page generation status and completion metrics
- Provides heartbeat mechanism for connection health

#### Connection Establishment
```typescript
// URL Format
ws://localhost:8001/api/wiki/jobs/{job_id}/progress?api_key=YOUR_API_KEY
```

#### Authentication
- Requires API key via query parameter
- Validates job ownership implicitly

#### Message Protocol

**Initial Status Message:**
```json
{
  "job_id": "job_123",
  "status": "running",
  "current_phase": 1,
  "progress_percent": 15.5,
  "message": "Status: running",
  "total_pages": 20,
  "completed_pages": 3,
  "failed_pages": 0
}
```

**Progress Update Message:**
```json
{
  "job_id": "job_123",
  "status": "running",
  "current_phase": 2,
  "progress_percent": 35.0,
  "message": "Generating authentication page",
  "page_id": "page_456",
  "page_title": "Authentication",
  "total_pages": 20,
  "completed_pages": 7,
  "failed_pages": 1
}
```

**Heartbeat Message:**
```json
{
  "heartbeat": true
}
```

**Final Status Message:**
```json
{
  "job_id": "job_123",
  "status": "completed",
  "current_phase": 3,
  "progress_percent": 100.0,
  "message": "Wiki generation completed",
  "total_pages": 20,
  "completed_pages": 19,
  "failed_pages": 1
}
```

#### Connection Lifecycle
1. Connect to WebSocket endpoint
2. Receive initial job status
3. Listen for progress updates
4. Handle heartbeat timeouts (30-second intervals)
5. Connection closes when job completes or client disconnects

---

## Client-Side Implementation

### WebSocket Client Utility (`src/utils/websocketClient.ts`)

#### Core Functions

```typescript
// Create WebSocket connection
export const createChatWebSocket = (
  request: ChatCompletionRequest,
  onMessage: (message: string) => void,
  onError: (error: Event) => void,
  onClose: () => void
): WebSocket => {
  const ws = new WebSocket(getWebSocketUrl());

  ws.onopen = () => {
    console.log('WebSocket connection established');
    ws.send(JSON.stringify(request));
  };

  ws.onmessage = (event) => {
    onMessage(event.data);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    onError(error);
  };

  ws.onclose = () => {
    console.log('WebSocket connection closed');
    onClose();
  };

  return ws;
};

// Close WebSocket connection
export const closeWebSocket = (ws: WebSocket | null): void => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
};
```

#### URL Construction

```typescript
// Build WebSocket URL with API key
export function buildWebSocketUrl(baseUrl: string, apiKey?: string): string {
  const key = apiKey || API_KEY;

  if (!key) {
    return baseUrl;
  }

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}api_key=${encodeURIComponent(key)}`;
}
```

### Frontend Integration Patterns

#### 1. Chat Component Integration (`src/components/Ask.tsx`)

```typescript
const webSocketRef = useRef<WebSocket | null>(null);

const handleAsk = async () => {
  // Close existing connection
  closeWebSocket(webSocketRef.current);

  // Create new WebSocket connection
  webSocketRef.current = createChatWebSocket(
    request,
    (message) => {
      setResponse(prev => prev + message);
    },
    (error) => {
      console.error('WebSocket error:', error);
      // Fallback to HTTP
      fetchHttpCompletion(request);
    },
    () => {
      // Connection closed
      setIsLoading(false);
    }
  );
};
```

#### 2. Wiki Generation Pattern (`src/app/[owner]/[repo]/page.tsx`)

```typescript
const generateWikiPage = async (page: WikiPage) => {
  return new Promise<string>((resolve, reject) => {
    const wsUrl = `ws://localhost:8001/ws/chat?api_key=${apiKey}`;
    const ws = new WebSocket(wsUrl);

    const timeout = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      reject(new Error('WebSocket connection timeout'));
    }, 30000);

    ws.onopen = () => {
      console.log(`WebSocket connection established for page: ${page.title}`);
      ws.send(JSON.stringify(requestBody));
      clearTimeout(timeout);
    };

    let content = '';
    ws.onmessage = (event) => {
      content += event.data;
    };

    ws.onclose = () => {
      console.log(`WebSocket connection closed for page: ${page.title}`);
      resolve(content);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error during message reception:', error);
      reject(new Error('WebSocket error during message reception'));
    };
  });
};
```

#### 3. Job Progress Monitoring (`src/app/wiki/job/[jobId]/page.tsx`)

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

  ws.onclose = () => {
    console.log('WebSocket closed');
  };

  return () => {
    ws.close();
  };
}, [jobId]);
```

---

## Error Handling and Reconnection

### Common Error Scenarios

1. **Authentication Failures**
   - Status code: 1008 (Policy Violation)
   - Messages: "Missing API key", "Invalid API key"

2. **Token Limit Exceeded**
   - Automatic fallback to simplified prompt
   - User notification about size constraints

3. **Repository Access Issues**
   - Informative error messages
   - Graceful degradation

4. **Connection Timeouts**
   - 30-second heartbeat intervals
   - Automatic reconnection attempts in some cases

### Reconnection Strategy

```typescript
const createWithRetry = (request, onMessage, onError, onClose, maxRetries = 3) => {
  let retryCount = 0;

  const attemptConnection = () => {
    if (retryCount >= maxRetries) {
      onError(new Error('Max retries reached'));
      return;
    }

    const ws = createChatWebSocket(
      request,
      onMessage,
      (error) => {
        console.error(`Attempt ${retryCount + 1} failed:`, error);
        retryCount++;
        setTimeout(attemptConnection, 1000 * retryCount); // Exponential backoff
      },
      onClose
    );

    return ws;
  };

  return attemptConnection();
};
```

---

## Best Practices

### 1. Connection Management
- Always close WebSocket connections when components unmount
- Use useRef for WebSocket references to avoid memory leaks
- Implement proper error boundaries

### 2. Message Handling
- Process streaming messages incrementally
- Handle incomplete or chunked data gracefully
- Validate incoming data structure

### 3. Performance Optimization
- Implement connection pooling for multiple requests
- Use debouncing for rapid-fire messages
- Cache frequently used data

### 4. Security Considerations
- Always validate API keys
- Sanitize user inputs before sending
- Use HTTPS/WSS in production
- Implement rate limiting

---

## Configuration

### Environment Variables

```bash
# WebSocket Server Configuration
DEEPWIKI_SERVER_BASE_URL=http://localhost:8001
DEEPWIKI_FRONTEND_API_KEY=your_frontend_api_key

# Authentication
DEEPWIKI_API_KEY_AUTH_ENABLED=true
DEEPWIKI_BACKEND_API_KEYS=key1,key2,key3

# CORS Origins
DEEPWIKI_ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

### Connection Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `api_key` | Authentication token | Required |
| `timeout` | Connection timeout | 30000ms |
| `retries` | Max retry attempts | 3 |
| `heartbeat` | Heartbeat interval | 30000ms |

---

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check server is running
   - Verify URL format
   - Check CORS settings

2. **Authentication Failed**
   - Verify API key is valid
   - Check environment variable configuration
   - Ensure key is properly URL-encoded

3. **No Streaming Response**
   - Check provider API keys
   - Verify repository accessibility
   - Check for error messages in console

4. **Connection Drops**
   - Check network stability
   - Implement proper reconnection logic
   - Monitor server logs for errors

### Debug Commands

```bash
# Check WebSocket server status
curl http://localhost:8001/health

# Test WebSocket connection manually
wscat -c ws://localhost:8001/ws/chat?api_key=your_key

# View server logs
tail -f logs/deepwiki.log
```

---

## Future Enhancements

### Planned Features

1. **Multi-tenant Support**
   - Per-user connection limits
   - Namespace-based routing

2. **Advanced Features**
   - Message persistence
   - Connection state synchronization
   - Real-time collaboration

3. **Performance Improvements**
   - Connection pooling
   - Message compression
   - Binary protocol support

4. **Security Enhancements**
   - JWT authentication
   - Message encryption
   - Audit logging

---

## References

- [FastAPI WebSocket Documentation](https://fastapi.tiangolo.com/advanced/websockets/)
- [MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [RFC 6455 (WebSocket Protocol)](https://tools.ietf.org/html/rfc6455)
- [DeepWiki API Documentation](AGENTS.api.md)
- [DeepWiki Frontend Documentation](AGENTS.frontend.md)