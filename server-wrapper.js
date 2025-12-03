/**
 * Custom server wrapper for Next.js standalone mode
 * Adds WebSocket proxy middleware to forward WS connections to backend API
 */

const { createProxyMiddleware } = require('http-proxy-middleware');
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

// Backend API configuration
const API_PORT = process.env.API_PORT || '8001';
const API_TARGET = `http://localhost:${API_PORT}`;

// Initialize Next.js app
const app = next({ dev, hostname, port, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // WebSocket proxy configuration
  const wsProxy = createProxyMiddleware({
    target: API_TARGET,
    ws: true, // Enable WebSocket proxying
    changeOrigin: true,
    logLevel: 'info',
    onError: (err, req, res) => {
      console.error('WebSocket proxy error:', err);
    },
    onProxyReqWs: (proxyReq, req, socket, options, head) => {
      console.log('WebSocket proxying:', req.url);
    },
  });

  // Handle WebSocket upgrade requests for /ws/* paths
  server.on('upgrade', (req, socket, head) => {
    const parsedUrl = parse(req.url, true);

    if (parsedUrl.pathname.startsWith('/ws/')) {
      console.log('Upgrading WebSocket connection for:', parsedUrl.pathname);
      wsProxy.upgrade(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket proxy enabled for /ws/* -> ${API_TARGET}/ws/*`);
  });
});
