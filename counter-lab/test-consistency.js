const assert = require('node:assert/strict');

const API_URL =
  process.env.TEST_API_URL || 'http://localhost:30080';

const REQUESTS = 100;

async function request(path, method = 'GET') {
  const response = await fetch(
    `${API_URL}${path}`,
    { method }
  );

  assert.equal(response.status, 200);

  return response.json();
}

async function testConsistency() {
  const initial = await request('/api/info');

  console.log(`Initial counter: ${initial.counter}`);

  const requests = Array.from(
    { length: REQUESTS },
    () => request('/increment', 'POST')
  );

  const results = await Promise.all(requests);

  const final = await request('/api/info');

  const values = results.map(item => item.counter);

  assert.equal(
    final.counter - initial.counter,
    REQUESTS
  );

  assert.equal(
    new Set(values).size,
    REQUESTS
  );

  assert.equal(
    Math.min(...values),
    initial.counter + 1
  );

  assert.equal(
    Math.max(...values),
    final.counter
  );

  console.log('CONSISTENCY TEST PASSED');
  console.log(`Requests: ${REQUESTS}`);
  console.log(`Final counter: ${final.counter}`);
  console.log(`Unique values: ${new Set(values).size}`);
}

testConsistency().catch(error => {
  console.error('CONSISTENCY TEST FAILED:', error.message);
  process.exitCode = 1;
});
