const http = require('http');
const os = require('os');

const PORT = Number(process.env.PORT || 3000);

const APP_VERSION = 'v4';
const APP_MESSAGE = 'Distributed counter with strong consistency';

const COUNTER_SERVICE_URL =
  process.env.COUNTER_SERVICE_URL ||
  'http://localhost:4000';

async function requestCounter(method, path) {
  const response = await fetch(
    `${COUNTER_SERVICE_URL}${path}`,
    {
      method,
      signal: AbortSignal.timeout(2500)
    }
  );

  if (!response.ok) {
    throw new Error('Counter service request failed');
  }

  const data = await response.json();
  return data.counter;
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });

  res.end(JSON.stringify(data));
}

function createInfo(counter) {
  return {
    version: APP_VERSION,
    message: APP_MESSAGE,
    pod: os.hostname(),
    counter,
    timestamp: new Date().toISOString()
  };
}

const server = http.createServer(async (req, res) => {
  const path = new URL(
    req.url,
    'http://localhost'
  ).pathname;

  if (req.method === 'GET' && path === '/health') {
    return sendJson(res, 200, {
      status: 'UP'
    });
  }

  if (req.method === 'GET' && path === '/api/info') {
    try {
      const counter = await requestCounter(
        'GET',
        '/counter'
      );

      return sendJson(res, 200, createInfo(counter));
    } catch (error) {
      return sendJson(res, 503, {
        error: 'Counter service unavailable'
      });
    }
  }

  if (req.method === 'POST' && path === '/increment') {
    try {
      const counter = await requestCounter(
        'POST',
        '/increment'
      );

      return sendJson(res, 200, {
        action: 'increment',
        ...createInfo(counter)
      });
    } catch (error) {
      return sendJson(res, 503, {
        error: 'Counter service unavailable'
      });
    }
  }

  if (req.method === 'GET' && path === '/') {
    try {
      const counter = await requestCounter(
        'GET',
        '/counter'
      );

      return sendJson(res, 200, createInfo(counter));
    } catch (error) {
      return sendJson(res, 503, {
        error: 'Counter service unavailable'
      });
    }
  }

  return sendJson(res, 404, {
    error: 'Route not found'
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`App ${APP_VERSION} running on port ${PORT}`);
  console.log(`Pod: ${os.hostname()}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
