import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

// Custom metrics
const stableResponses = new Counter('responses_v2');
const canaryResponses = new Counter('responses_v3');
const unexpectedResponses = new Counter('unexpected_responses');

export const options = {
  scenarios: {
    canary_test: {
      executor: 'shared-iterations',
      vus: 20,
      iterations: 200,
      maxDuration: '2m'
    }
  },

  noConnectionReuse: true,

  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
    unexpected_responses: ['count==0'],
    responses_v2: ['count>0'],
    responses_v3: ['count>0']
  }
};

export default function () {
  stableResponses.add(0);
  canaryResponses.add(0);
  unexpectedResponses.add(0);

  const response = http.get(
    'http://localhost:30080/api/info',
    {
      headers: {
        'Connection': 'close'
      }
    }
  );

  const success = check(response, {
    'HTTP status is 200': (r) => r.status === 200,
    'Response contains version': (r) => {
      if (r.status !== 200) return false;

      try {
        const version = r.json('version');
        return version === 'v2' || version === 'v3';
      } catch {
        return false;
      }
    }
  });

  if (!success) {
    unexpectedResponses.add(1);
    console.error(
      `VU ${__VU} | HTTP ${response.status}`
    );
    return;
  }

  const data = response.json();

  if (data.version === 'v2') {
    stableResponses.add(1);
  } else if (data.version === 'v3') {
    canaryResponses.add(1);
  }

  console.log(
    `VU: ${__VU} | ` +
    `Iteration: ${__ITER} | ` +
    `Pod: ${data.pod} | ` +
    `Version: ${data.version}`
  );

  sleep(0.1);
}
