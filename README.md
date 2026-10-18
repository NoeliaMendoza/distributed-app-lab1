# Distributed App Lab

Laboratorio de aplicaciones distribuidas con Node.js, Docker, Kubernetes y k6.

## Retos

- **Canary Deployment:** aplicación principal configurable como v2 o v3, con cuatro réplicas estables y una candidata. Consultar [README-canary.md](README-canary.md) para construir, desplegar, medir y revertir.
- **Contador distribuido:** implementación independiente en [counter-lab/](counter-lab/), con tres réplicas de aplicación y un servicio central de contador en memoria.

## Requisitos

Node.js 22 o superior, Docker Desktop con Kubernetes habilitado, kubectl y k6.
Ejecutar los comandos desde la carpeta del reto correspondiente.

## Contador distribuido

```powershell
cd counter-lab
docker build -t distributed-app:v4 .
kubectl apply -f counter-deployment.yaml
kubectl rollout status deployment/counter-service --timeout=120s
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl rollout status deployment/distributed-app --timeout=120s
node test-consistency.js
```

Si Canary está desplegado, escalar primero sus Deployments a cero para evitar que compartan tráfico con el contador. El contador central pierde su valor al reiniciarse y no ofrece alta disponibilidad.

Los archivos `deployment.yaml`, `counter-deployment.yaml`, `counter-server.js` y `test-consistency.js` de la raíz se conservan del reto anterior. Para construir y ejecutar ese reto, usar la copia completa de `counter-lab/`. Para Canary, aplicar únicamente los manifiestos indicados en su guía; no ejecutar `kubectl apply -f .`.

## Pruebas

- `canary-test.js`: 200 solicitudes para observar respuestas v2 y v3, errores y latencia.
- `counter-lab/test-consistency.js`: 100 incrementos concurrentes contra el contador compartido, sin otras escrituras simultáneas.
- `baseline-test.js`, `smoke-test.js`, `resilience-test.js` y `update-test.js`: pruebas de carga con k6.

Los archivos de resultados y registros generados no se incluyen en Git.
