const http = require('http');
const os = require('os');

const PORT = Number(process.env.PORT || 3000);
const APP_VERSION = process.env.APP_VERSION || 'v2';
const APP_MESSAGE =
  process.env.APP_MESSAGE ||
  `Distributed App Lab - Version ${APP_VERSION}`;

let localCounter = 0;

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function info() {
  return {
    version: APP_VERSION,
    message: APP_MESSAGE,
    pod: os.hostname(),
    counter: localCounter,
    timestamp: new Date().toISOString()
  };
}

const server = http.createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;

  if (req.method === 'GET' && path === '/health') {
    return sendJson(res, 200, { status: 'UP' });
  }

  if (req.method === 'GET' && (path === '/' || path === '/api/info')) {
    return sendJson(res, 200, info());
  }

  if (req.method === 'POST' && path === '/increment') {
    localCounter += 1;
    return sendJson(res, 200, { action: 'increment', ...info() });
  }

  return sendJson(res, 404, { error: 'Route not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`App ${APP_VERSION} running on port ${PORT}`);
  console.log(`Pod: ${os.hostname()}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
});
