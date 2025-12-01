# 🚀 DeepWiki API

This is the backend API for DeepWiki, providing smart code analysis and AI-powered documentation generation.

## ✨ Features

- **Streaming AI Responses**: Real-time responses using Google's Generative AI (Gemini)
- **Smart Code Analysis**: Automatically analyzes GitHub repositories
- **RAG Implementation**: Retrieval Augmented Generation for context-aware responses
- **Local Storage**: All data stored locally - no cloud dependencies
- **Conversation History**: Maintains context across multiple questions

## 🔧 Quick Setup

### Step 1: Install Dependencies

```bash
# From the project root
python -m pip install poetry==2.0.1 && poetry install
```

### Step 2: Set Up Environment Variables

Create a `.env` file in the project root:

```
# Required API Keys
GOOGLE_API_KEY=your_google_api_key        # Required for Google Gemini models
OPENAI_API_KEY=your_openai_api_key        # Required for embeddings and OpenAI models

# Optional API Keys
OPENROUTER_API_KEY=your_openrouter_api_key  # Required only if using OpenRouter models

# AWS Bedrock Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key_id      # Required for AWS Bedrock models
AWS_SECRET_ACCESS_KEY=your_aws_secret_key     # Required for AWS Bedrock models
AWS_REGION=us-east-1                          # Optional, defaults to us-east-1
AWS_ROLE_ARN=your_aws_role_arn                # Optional, for role-based authentication

# OpenAI API Configuration
OPENAI_BASE_URL=https://custom-api-endpoint.com/v1  # Optional, for custom OpenAI API endpoints

# Ollama host
OLLAMA_HOST=https://your_ollama_host"  # Optional: Add Ollama host if not local. default: http://localhost:11434

# Server Configuration
PORT=8001  # Optional, defaults to 8001
```

If you're not using Ollama mode, you need to configure an OpenAI API key for embeddings. Other API keys are only required when configuring and using models from the corresponding providers.

> 💡 **Where to get these keys:**
> - Get a Google API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
> - Get an OpenAI API key from [OpenAI Platform](https://platform.openai.com/api-keys)
> - Get an OpenRouter API key from [OpenRouter](https://openrouter.ai/keys)
> - Get AWS credentials from [AWS IAM Console](https://console.aws.amazon.com/iam/)

#### Advanced Environment Configuration

##### Provider-Based Model Selection
DeepWiki supports multiple LLM providers. The environment variables above are required depending on which providers you want to use:

- **Google Gemini**: Requires `GOOGLE_API_KEY`
- **OpenAI**: Requires `OPENAI_API_KEY`
- **OpenRouter**: Requires `OPENROUTER_API_KEY`
- **AWS Bedrock**: Requires `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
- **Ollama**: No API key required (runs locally)

##### Custom OpenAI API Endpoints
The `OPENAI_BASE_URL` variable allows you to specify a custom endpoint for the OpenAI API. This is useful for:

- Enterprise users with private API channels
- Organizations using self-hosted or custom-deployed LLM services
- Integration with third-party OpenAI API-compatible services

**Example:** you can use the endpoint which support the OpenAI protocol provided by any organization
```
OPENAI_BASE_URL=https://custom-openai-endpoint.com/v1
```

##### Configuration Files
DeepWiki now uses JSON configuration files to manage various system components instead of hardcoded values:

1. **`generator.json`**: Configuration for text generation models
   - Located in `api/config/` by default
   - Defines available model providers (Google, OpenAI, OpenRouter, AWS Bedrock, Ollama)
   - Specifies default and available models for each provider
   - Contains model-specific parameters like temperature and top_p

2. **`embedder.json`**: Configuration for embedding models and text processing
   - Located in `api/config/` by default
   - Defines embedding models for vector storage
   - Contains retriever configuration for RAG
   - Specifies text splitter settings for document chunking

3. **`repo.json`**: Configuration for repository handling
   - Located in `api/config/` by default
   - Contains file filters to exclude certain files and directories
   - Defines repository size limits and processing rules

You can customize the configuration directory location using the environment variable:

```
DEEPWIKI_CONFIG_DIR=/path/to/custom/config/dir  # Optional, for custom config file location
```

This allows you to maintain different configurations for various environments or deployment scenarios without modifying the code.

### Step 3: Start the API Server

```bash
# From the project root
python -m api.main
```

The API will be available at `http://localhost:8001`

## 🧠 How It Works

### 1. Repository Indexing
When you provide a GitHub repository URL, the API:
- Clones the repository locally (if not already cloned)
- Reads all files in the repository
- Creates embeddings for the files using OpenAI
- Stores the embeddings in a local database

### 2. Smart Retrieval (RAG)
When you ask a question:
- The API finds the most relevant code snippets
- These snippets are used as context for the AI
- The AI generates a response based on this context

### 3. Real-Time Streaming
- Responses are streamed in real-time
- You see the answer as it's being generated
- This creates a more interactive experience

## 📡 API Endpoints

### GET /
Returns basic API information and available endpoints.

### POST /chat/completions/stream
Streams an AI-generated response about a GitHub repository.

**Request Body:**

```json
{
  "repo_url": "https://github.com/username/repo",
  "messages": [
    {
      "role": "user",
      "content": "What does this repository do?"
    }
  ],
  "filePath": "optional/path/to/file.py"  // Optional
}
```

**Response:**
A streaming response with the generated text.

## 📝 Example Code

```python
import requests

# API endpoint
url = "http://localhost:8001/chat/completions/stream"

# Request data
payload = {
    "repo_url": "https://github.com/AsyncFuncAI/deepwiki-open",
    "messages": [
        {
            "role": "user",
            "content": "Explain how React components work"
        }
    ]
}

# Make streaming request
response = requests.post(url, json=payload, stream=True)

# Process the streaming response
for chunk in response.iter_content(chunk_size=None):
    if chunk:
        print(chunk.decode('utf-8'), end='', flush=True)
```

## 💾 Storage

All data is stored locally on your machine:
- Cloned repositories: `~/.adalflow/repos/`
- Embeddings and indexes: `~/.adalflow/databases/`
- Generated wiki cache: `~/.adalflow/wikicache/`

No cloud storage is used - everything runs on your computer!

## 🔔 Webhooks

DeepWiki supports incoming webhooks to trigger repository update checks and cache invalidation.

- Endpoint: `POST /api/wiki/webhook/{provider}`
- Providers: `github`, `azure`

### GitHub Webhook (HMAC SHA-256)

- Configure in GitHub: Repository → Settings → Webhooks
  - Payload URL: `http://<host>:8001/api/wiki/webhook/github`
  - Content type: `application/json`
  - Secret: set to the same value as `GITHUB_WEBHOOK_SECRET`
  - Events: typically “Just the push event”

- Server validation: Computes `sha256=<hex>` HMAC of raw body using `GITHUB_WEBHOOK_SECRET` and compares with `X-Hub-Signature-256` header (api/api.py:642-663)

Example: generate signature and send test request (Python)

```python
import hmac, hashlib, json, requests, os

secret = os.environ.get("GITHUB_WEBHOOK_SECRET", "change-me")
body = json.dumps({
  "repository": {"full_name": "owner/repo"},
  "ref": "refs/heads/main",
  "zen": None
}, separators=(",", ":"))  # ensure minimized JSON

sig = "sha256=" + hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
r = requests.post(
  "http://localhost:8001/api/wiki/webhook/github",
  data=body,
  headers={"Content-Type": "application/json", "X-Hub-Signature-256": sig}
)
print(r.status_code, r.text)
```

Example: curl with openssl

```bash
SECRET="change-me"
BODY='{"repository":{"full_name":"owner/repo"},"ref":"refs/heads/main"}'
SIG="sha256=$(printf "%s" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -binary | xxd -p -c 256)"
curl -sS -X POST \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIG" \
  --data "$BODY" \
  http://localhost:8001/api/wiki/webhook/github
```

### Azure DevOps Service Hooks (Token + Optional Structure Check)

- Configure in Azure DevOps: Project Settings → Service hooks → Web Hooks
  - URL: `http://<host>:8001/api/wiki/webhook/azure`
  - Use HTTPS in production
  - Add a custom header `X-Azure-DevOps-Token: <your-token>` that matches `AZURE_DEVOPS_WEBHOOK_TOKEN`
  - Choose events such as `git.push`, `git.pullrequest.created`

- Optional validation controls:
  - `AZURE_DEVOPS_VALIDATE_STRUCTURE=true` (default) enables payload structure checks
  - `AZURE_DEVOPS_ACCEPT_EVENT_TYPES=git.push,git.pullrequest.created,git.pullrequest.updated`

- Server handler extracts repository info from `resource.repository.remoteUrl` or `resource.repository.url` and triggers an update (api/api.py:665-739)

Example: curl test request

```bash
TOKEN="change-me"
BODY='{
  "eventType":"git.push",
  "resource":{
    "repository":{
      "remoteUrl":"https://dev.azure.com/org/project/_git/repo"
    },
    "commits":[{"id":"abc"}]
  }
}'
curl -sS -X POST \
  -H "Content-Type: application/json" \
  -H "X-Azure-DevOps-Token: $TOKEN" \
  --data "$BODY" \
  http://localhost:8001/api/wiki/webhook/azure
```

### Check Update Status

- Per repo: `GET /api/wiki/auto-update/status/{repo_id}`
- All repos: `GET /api/wiki/auto-update/status`

Where `repo_id` is `github/<owner>/<repo>` or `azure/<org>/<repo>`.

### References

- GitHub webhook signature (HMAC SHA-256): https://docs.github.com/en/developers/webhooks-and-events/webhooks/securing-your-webhooks
- Azure DevOps Webhooks overview: https://learn.microsoft.com/en-us/azure/devops/service-hooks/services/webhooks
