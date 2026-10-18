
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL =
  __ENV.BASE_URL || 'http://localhost:30080';

const VUS = Number(__ENV.VUS || 20);
const SLEEP = Number(__ENV.SLEEP === undefined ? 0.2 : __ENV.SLEEP);
if (!Number.isFinite(SLEEP) || SLEEP < 0) {
  throw new Error('SLEEP debe ser un número mayor o igual a cero');
}

export const options = {
  scenarios: {
    degradation_test: {
      executor: 'constant-vus',
      vus: VUS,
      duration: '30s',
      gracefulStop: '5s'
    }
  },

  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500']
  }
};

export default function () {
  const response = http.get(
    `${BASE_URL}/api/info`,
    {
      timeout: '5s',
      tags: {
        endpoint: 'api_info'
      }
    }
  );

  check(response, {
    'Status is 200': (r) => r.status === 200,
    'Valid JSON response': (r) => {
      if (r.status !== 200) return false;

      try {
        const data = r.json();
        return (
          typeof data.version === 'string' &&
          typeof data.pod === 'string'
        );
      } catch {
        return false;
      }
    }
  });

  sleep(SLEEP);
}

// Export aggregated metrics to JSON
export function handleSummary(data) {
  const outputFile =
    __ENV.OUTPUT_FILE || 'summary.json';

  return {
    [outputFile]: JSON.stringify({
      ...data,
      experiment: { baseUrl: BASE_URL, vus: VUS, sleep: SLEEP, duration: '30s' }
    }, null, 2)
  };
}
