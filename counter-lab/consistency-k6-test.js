import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:30080').replace(/\/$/, '');
const successful = new Counter('successful_increments');
const failed = new Counter('failed_increments');
const finalMismatch = new Counter('final_counter_mismatch');

export const options = {
  scenarios: {
    increments: { executor: 'per-vu-iterations', vus: 100, iterations: 1, maxDuration: '60s' },
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    checks: ['rate==1'],
    successful_increments: ['count==100'],
    failed_increments: ['count==0'],
    final_counter_mismatch: ['count==0'],
  },
};

function readCounter() {
  const response = http.get(`${BASE_URL}/api/info`);
  const data = response.json();
  if (response.status !== 200 || !Number.isSafeInteger(data.counter)) {
    throw new Error('No se pudo leer el contador compartido');
  }
  return data.counter;
}

export function setup() {
  const initial = readCounter();
  if (!Number.isSafeInteger(initial + 100)) throw new Error('Contador fuera del rango seguro');
  console.log(`CONSISTENCY_INITIAL ${initial}`);
  return { initial };
}

export default function () {
  const response = http.post(`${BASE_URL}/increment`, null, { timeout: '10s' });
  let data = {};
  try { data = response.json(); } catch (_) { /* Se registra como respuesta inválida. */ }
  const valid = check(response, {
    'HTTP 200': (r) => r.status === 200,
    'contador entero': () => Number.isSafeInteger(data.counter),
    'pod identificado': () => typeof data.pod === 'string' && data.pod.length > 0,
  });
  successful.add(valid ? 1 : 0);
  failed.add(valid ? 0 : 1);
  if (valid) console.log(`CONSISTENCY_VALUE ${JSON.stringify({ vu: __VU, counter: data.counter, pod: data.pod })}`);
}

export function teardown({ initial }) {
  const final = readCounter();
  finalMismatch.add(final === initial + 100 ? 0 : 1);
  check(final, { 'contador final = inicial + 100': (value) => value === initial + 100 });
  console.log(`CONSISTENCY_FINAL ${final}`);
}
