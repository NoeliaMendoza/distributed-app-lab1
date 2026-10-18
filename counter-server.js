const http = require('http');
const os = require('os');

const PORT = Number(process.env.COUNTER_PORT || 4000);

let counter = 0;

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });

  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  const path = new URL(
    req.url,
    'http://localhost'
  ).pathname;

  // Health check
  if (req.method === 'GET' && path === '/health') {
    return sendJson(res, 200, {
      status: 'UP'
    });
  }

  // Read shared counter
  if (req.method === 'GET' && path === '/counter') {
    return sendJson(res, 200, {
      counter,
      server: os.hostname()
    });
  }

  // Increment shared counter
  if (req.method === 'POST' && path === '/increment') {

    if (counter === Number.MAX_SAFE_INTEGER) {
      return sendJson(res, 409, {
        error: 'Counter limit reached'
      });
    }

    counter += 1;

    console.log(`Counter updated: ${counter}`);

    return sendJson(res, 200, {
      counter,
      server: os.hostname()
    });
  }

  return sendJson(res, 404, {
    error: 'Route not found'
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Counter service running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
