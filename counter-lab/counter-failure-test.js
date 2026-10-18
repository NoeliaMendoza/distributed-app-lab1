import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:30080').replace(/\/$/, '');
const successful = new Counter('successful_increments');
const failed = new Counter('failed_increments');
const unavailable = new Counter('http_503_responses');

export const options = {
  scenarios: {
    increments: { executor: 'constant-vus', vus: 20, duration: '40s', gracefulStop: '10s' },
  },
  thresholds: { http_req_failed: ['rate<0.05'] },
};

export default function () {
  const response = http.post(`${BASE_URL}/increment`, null, { timeout: '10s' });
  let data = {};
  try { data = response.json(); } catch (_) { /* Se contabiliza como fallo. */ }
  const valid = check(response, {
    'incremento válido': (r) => r.status === 200 && Number.isSafeInteger(data.counter) &&
      typeof data.pod === 'string' && data.pod.length > 0,
  });
  successful.add(valid ? 1 : 0);
  failed.add(valid ? 0 : 1);
  unavailable.add(response.status === 503 ? 1 : 0);
  if (!valid) console.error(`FAILURE_EVENT ${JSON.stringify({ vu: __VU, status: response.status, error: response.error || data.error || 'Respuesta inválida' })}`);
  // Muestreo para observar pods y valores sin registrar cada incremento.
  else if (__ITER % 100 === 0) console.log(`COUNTER_SAMPLE ${JSON.stringify({ pod: data.pod, counter: data.counter })}`);
}
