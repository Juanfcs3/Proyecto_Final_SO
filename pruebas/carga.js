import { check } from 'k6';
import http from 'k6/http';
import { Counter } from 'k6/metrics';

const solicitudesPorInstancia = {
  'backend-1': new Counter('respuestas_backend_1'),
  'backend-2': new Counter('respuestas_backend_2'),
  'backend-3': new Counter('respuestas_backend_3'),
};

const tasa = Number(__ENV.TASA || 25);
if (!Number.isInteger(tasa) || tasa < 1) {
  throw new Error('TASA debe ser un número entero positivo');
}

export const options = {
  scenarios: {
    trafico: {
      executor: 'constant-arrival-rate',
      rate: tasa,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 10,
      maxVUs: 30,
    },
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
    dropped_iterations: ['count==0'],
    respuestas_backend_1: ['count>0'],
    respuestas_backend_2: ['count>0'],
    respuestas_backend_3: ['count>0'],
  },
};

export default function () {
  const response = http.get('http://127.0.0.1:8080/', { timeout: '2s' });
  let instance;
  if (response.status === 200) {
    try {
      instance = response.json('instance');
    } catch {
      // Una respuesta inválida debe quedar registrada como un check fallido.
    }
  }

  const backendValido = Object.hasOwn(solicitudesPorInstancia, instance);
  check(response, {
    'respuesta HTTP 200': (r) => r.status === 200,
    'backend identificado': () => backendValido,
  });
  if (backendValido) {
    solicitudesPorInstancia[instance].add(1);
  }
}
