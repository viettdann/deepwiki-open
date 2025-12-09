# Build argument for custom certificates directory
ARG CUSTOM_CERT_DIR="certs"

FROM node:20-alpine3.22 AS node_deps
WORKDIR /app
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    --mount=type=bind,source=package.json,target=/app/package.json \
    --mount=type=bind,source=yarn.lock,target=/app/yarn.lock \
  yarn install --production --frozen-lockfile --legacy-peer-deps

FROM node_deps AS node_deps_builder

RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
  --mount=type=bind,source=package.json,target=/app/package.json \
  --mount=type=bind,source=yarn.lock,target=/app/yarn.lock \
  yarn install --frozen-lockfile --legacy-peer-deps

FROM node_deps_builder AS node_builder

# Increase Node.js memory limit for build and disable telemetry
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=bind,source=package.json,target=/app/package.json \
    --mount=type=bind,source=yarn.lock,target=/app/yarn.lock \
    --mount=type=bind,source=next.config.ts,target=/app/next.config.ts \
    --mount=type=bind,source=tsconfig.json,target=/app/tsconfig.json \
    --mount=type=bind,source=postcss.config.mjs,target=/app/postcss.config.mjs \
    --mount=type=bind,source=src,target=/app/src \
    NODE_ENV=production yarn run build

FROM python:3.11-slim AS py_deps
WORKDIR /api
ARG PYTORCH_DEVICE=cpu
ENV UV_PROJECT_ENVIRONMENT="/opt/venv" \
    UV_COMPILE_BYTECODE=1 \
    PATH="/opt/venv/bin:$PATH"

COPY --from=ghcr.io/astral-sh/uv:0.7.12 /uv /usr/local/bin/uv

RUN --mount=type=bind,source=api/pyproject.toml,target=/api/pyproject.toml \
    --mount=type=bind,source=api/uv.lock,target=/api/uv.lock \
    uv sync --frozen --no-dev

RUN if [ "${PYTORCH_DEVICE}" = "cpu" ]; then \
        uv pip install --no-cache-dir torch --no-deps --index-url https://download.pytorch.org/whl/cpu; \
    else \
        uv pip install --no-cache-dir torch --no-deps --index-url https://download.pytorch.org/whl/cu128; \
    fi

RUN uv pip install --no-cache-dir sentence-transformers

# Use Python 3.11 as final image
FROM python:3.11-slim
ARG API_PORT=8001
ARG FE_PORT=3000
ARG NODE_ENV=production
ARG SERVER_BASE_URL=http://localhost:${API_PORT}

# Set environment variables
ENV API_PORT=${API_PORT} \
    FE_PORT=${FE_PORT} \
    NODE_ENV=${NODE_ENV} \
    SERVER_BASE_URL=${SERVER_BASE_URL}

# Create a non-root user
ARG UID=1000
ARG GID=1000
ARG APP_USER=viettdann
RUN groupadd -g "${GID}" ${APP_USER} && \
    useradd -l -u "${UID}" -g ${APP_USER} -s /bin/bash -m -d /home/${APP_USER} ${APP_USER}

# Set working directory
WORKDIR /app
RUN chown ${APP_USER}:${APP_USER} /app

# Set shell with pipefail for proper error handling in pipes
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install Node.js 20.x and other dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg \
    git \
    ca-certificates \
    tini \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Update certificates if custom ones were provided and copied successfully
RUN if [ -n "${CUSTOM_CERT_DIR}" ]; then \
    mkdir -p /usr/local/share/ca-certificates && \
    if [ -d "${CUSTOM_CERT_DIR}" ]; then \
    cp -r "${CUSTOM_CERT_DIR}"/* /usr/local/share/ca-certificates/ 2>/dev/null || true; \
    update-ca-certificates; \
    echo "Custom certificates installed successfully."; \
    else \
    echo "Warning: ${CUSTOM_CERT_DIR} not found. Skipping certificate installation."; \
    fi \
    fi

ENV PATH="/opt/venv/bin:$PATH"

# Copy Python dependencies
COPY --chown=${APP_USER}:${APP_USER} --from=py_deps /opt/venv /opt/venv
COPY --chown=${APP_USER}:${APP_USER} api/ ./api/

# Copy Node.js dependencies and built app
COPY --chown=${APP_USER}:${APP_USER} --from=node_builder /app/.next/standalone ./
COPY --chown=${APP_USER}:${APP_USER} --from=node_builder /app/.next/static ./.next/static
COPY --chown=${APP_USER}:${APP_USER} ./public ./public

# Create a script to run both backend and frontend
RUN touch .env \
    && chown ${APP_USER}:${APP_USER} .env \
    && cat <<'EOF' > /app/start.sh \
    && chmod +x /app/start.sh \
    && chown ${APP_USER}:${APP_USER} /app/start.sh
#!/bin/bash
set -e

# Load environment variables from .env if it exists
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Check for at least one configured API key or Ollama
api_keys_present=0
for key in GOOGLE_API_KEY OPENAI_API_KEY OPENROUTER_API_KEY DEEPSEEK_API_KEY OLLAMA_HOST; do
  if [ -n "${!key}" ]; then
api_keys_present=1
break
  fi
done

if [ $api_keys_present -eq 0 ]; then
  echo "⚠️  Warning: No API keys configured and no Ollama host found."
  echo "You need at least one API key or a local Ollama setup to use this service."
fi

# Start backend API server
python -m api.main --port "${API_PORT}" &
API_PID=$!

# Start Next.js frontend server
PORT=${FE_PORT} HOSTNAME=0.0.0.0 node server.js &
FRONTEND_PID=$!

# Trap SIGTERM to gracefully shutdown both processes
trap "kill $API_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGTERM

# Wait for any process to exit
wait -n
exit_code=$?

# Clean up if one process exits
kill $API_PID $FRONTEND_PID 2>/dev/null || true
exit $exit_code
EOF

# Expose the port the app runs on
EXPOSE ${API_PORT} ${FE_PORT}

# Health check to monitor container status
HEALTHCHECK --interval=60s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000 || exit 1

ENTRYPOINT ["tini", "--"]

# Switch to non-root user
USER ${APP_USER}

# Command to run the application
CMD ["/app/start.sh"]
