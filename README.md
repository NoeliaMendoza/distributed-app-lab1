# Laboratorio de aplicaciones distribuidas

Aplicación Node.js desplegada en Kubernetes para probar balanceo entre réplicas, recuperación de pods, actualizaciones de versión y rendimiento con Grafana k6.

El proyecto incluye dos implementaciones: una aplicación con contador local por réplica, utilizada para las pruebas de carga y Canary, y una versión con un servicio central que mantiene un contador compartido.

## Requisitos

- Node.js 22 o superior.
- Docker Desktop con Kubernetes habilitado.
- kubectl y Grafana k6.

Los comandos están escritos para PowerShell y se ejecutan desde `distributed-app-lab`, salvo cuando se indica entrar en `counter-lab`.

## Archivos principales

| Archivo | Descripción |
| --- | --- |
| `server.js` | Servidor v2/v3 con contador local, versión y nombre del pod |
| `Dockerfile` | Construcción de las imágenes v2 y v3 |
| `deployment-stable.yaml` | Deployment de la versión estable v2 |
| `deployment-canary.yaml` | Deployment de la versión candidata v3 |
| `service.yaml` | Acceso a la aplicación por el puerto 30080 |
| `counter-lab/` | Servidor v4, contador central, manifiestos y pruebas de consistencia |
| `*-test.js` | Pruebas de funcionamiento, carga, resiliencia y actualizaciones |
| `results/` | Resultados de carga con 1, 3 y 10 réplicas |

Los archivos del contador que también aparecen en la raíz pertenecen a una versión anterior. Para ejecutar el contador compartido se utiliza `counter-lab/`.

## Aplicación local

```powershell
node server.js
```

La aplicación escucha en `http://localhost:3000` y expone estos endpoints:

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/` | Información de la aplicación |
| GET | `/api/info` | Versión, pod, contador y fecha |
| GET | `/health` | Estado del proceso |
| POST | `/increment` | Incrementa el contador |

Por ejemplo, desde otra terminal:

```powershell
Invoke-RestMethod http://localhost:3000/api/info
Invoke-RestMethod -Method Post http://localhost:3000/increment
```

El contador de v2/v3 se almacena en la memoria de cada proceso. Cada réplica tiene su propio valor y lo pierde al reiniciarse.

## Despliegue con Docker y Kubernetes

Construir las dos versiones desde la raíz del proyecto:

```powershell
docker build --build-arg APP_VERSION=v2 -t distributed-app:v2 .
docker build --build-arg APP_VERSION=v3 -t distributed-app:v3 .
```

Para iniciar únicamente la versión estable:

```powershell
kubectl apply -f deployment-stable.yaml
kubectl apply -f service.yaml
kubectl rollout status deployment/distributed-app-stable --timeout=120s
kubectl get pods -L app,track
Invoke-RestMethod http://localhost:30080/api/info
```

Antes de cambiar de escenario, escalar a cero los Deployments que no se utilizarán y esperar a que sus pods terminen. Stable, canary y v4 comparten la etiqueta que selecciona el Service; si siguen activos, pueden recibir parte del tráfico. Aplicar los manifiestos por nombre en lugar de usar `kubectl apply -f .`.

Las imágenes usan `imagePullPolicy: Never`, por lo que deben estar disponibles en el entorno del nodo.

### Escalamiento y recuperación de pods

```powershell
kubectl scale deployment distributed-app-stable --replicas=3
kubectl rollout status deployment/distributed-app-stable --timeout=120s
```

Para observar la recuperación automática, eliminar una réplica y seguir el estado de los pods:

```powershell
$appPod = kubectl get pods -l track=stable -o jsonpath='{.items[0].metadata.name}'
if ([string]::IsNullOrWhiteSpace($appPod)) { throw 'No se encontró un pod stable' }
kubectl delete pod $appPod --wait=false
kubectl get pods -w
```

Kubernetes crea un reemplazo para mantener el número de réplicas declarado. El nuevo proceso comienza con su contador local en cero. Finalizar la observación con Ctrl+C.

## Pruebas con k6

| Script | Carga | Criterios configurados |
| --- | --- | --- |
| `smoke-test.js` | 1 VU, 10 s | Checks de estado y versión |
| `baseline-test.js` | 100 VUs, 30 s, pausa de 0.1 s | Errores < 1 %, p95 < 250 ms |
| `resilience-test.js` | Hasta 20 VUs, 60 s | Errores < 1 %, p95 < 500 ms, checks > 99 % |
| `update-test.js` | 10 VUs, 60 s | Errores < 1 %, p95 < 500 ms, checks > 99 % |
| `canary-test.js` | 20 VUs, 200 solicitudes | Respuestas de v2 y v3, errores < 1 %, p95 < 500 ms |
| `degradation-test.js` | VUs configurables, 30 s | Errores < 1 %, p95 < 500 ms |

Para ejecutar las pruebas básicas y guardar sus resúmenes:

```powershell
$runDir = 'results/run-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
k6 run --summary-export="$runDir/smoke.json" smoke-test.js
k6 run --summary-export="$runDir/baseline.json" baseline-test.js
k6 run --summary-export="$runDir/resilience.json" resilience-test.js
```

Durante la prueba de resiliencia se elimina un pod desde otra terminal. Los scripts muestran muestras del usuario virtual, iteración, pod y versión para observar qué réplica responde.

El resumen de k6 muestra solicitudes por segundo, porcentaje de errores y tiempos de respuesta. El p95 indica el tiempo que no supera aproximadamente el 95 % de las solicitudes. Los thresholds definen cuándo la prueba se considera aprobada o fallida.

### Rolling Update y rollback

El Deployment stable utiliza `maxUnavailable: 0`, `maxSurge: 1` y una readiness probe en `/health`.

En clase se utilizó el Deployment `distributed-app`. En esta organización del proyecto, la aplicación v2/v3 está en `distributed-app-stable`; por eso los comandos siguientes usan ese nombre. El contenedor sigue llamándose `distributed-app`. El Deployment `distributed-app` queda reservado para el contador compartido v4.

Con las imágenes v2/v3 construidas, preparar stable en v2 y dejarlo como único Deployment de aplicación atendiendo tráfico. Omitir el escalado de Deployments que todavía no existan:

```powershell
kubectl scale deployment distributed-app distributed-app-canary --replicas=0
kubectl apply -f deployment-stable.yaml
kubectl apply -f service.yaml
kubectl rollout status deployment/distributed-app-stable --timeout=120s
```

Esperar a que terminen los pods anteriores. En la terminal 1, iniciar la carga de 10 VUs durante 60 segundos:

```powershell
k6 run update-test.js
```

En la terminal 2, observar los pods:

```powershell
kubectl get pods -w
```

Mientras k6 genera tráfico, en una tercera terminal actualizar a v3:

```powershell
kubectl set image deployment/distributed-app-stable distributed-app=distributed-app:v3
kubectl rollout status deployment/distributed-app-stable --timeout=120s
```

Tras completar la actualización, provocar un despliegue incorrecto con la etiqueta `v99`, que debe estar ausente de las imágenes del nodo:

```powershell
kubectl set image deployment/distributed-app-stable distributed-app=distributed-app:v99
kubectl get pods
kubectl get deployments
```

Con `imagePullPolicy: Never`, los pods nuevos no podrán iniciar si v99 no existe localmente. Los pods de v3 permanecen disponibles gracias a `maxUnavailable: 0`. Observar el error y revertir el cambio:

```powershell
kubectl rollout undo deployment/distributed-app-stable
kubectl rollout status deployment/distributed-app-stable --timeout=120s
kubectl get pods
kubectl get deployment distributed-app-stable -o jsonpath="{.spec.template.spec.containers[0].image}"
```

La imagen final esperada es `distributed-app:v3`: el rollback deshace el intento de desplegar v99. Para medir también ese intento y la recuperación, repetir `k6 run update-test.js` si la primera ejecución ya terminó. Finalizar la observación de pods con Ctrl+C.

## Contador compartido

La versión v4 utiliza tres réplicas de aplicación y un servicio central en memoria. Las réplicas envían las lecturas y los incrementos a `counter-service:4000`, que mantiene un único contador.

El servicio central tiene una sola réplica y estrategia `Recreate`. Esto permite coordinar los incrementos en un proceso, pero también lo convierte en un punto único de falla: al reiniciarse, pierde el valor almacenado. Los incrementos no tienen claves de idempotencia, por lo que repetir una solicitud puede volver a incrementar el contador.

### Despliegue y prueba de consistencia

Si stable y canary existen, detenerlos primero:

```powershell
kubectl scale deployment distributed-app-stable distributed-app-canary --replicas=0
```

Después, entrar en la carpeta del contador:

```powershell
cd counter-lab
docker build -t distributed-app:v4 .
kubectl apply -f counter-deployment.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl rollout status deployment/counter-service --timeout=120s
kubectl rollout status deployment/distributed-app --timeout=120s
```

Ejecutar k6 y comprobar los valores registrados:

```powershell
$runDir = 'results/consistency-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
k6 run --log-format=json --console-output="$runDir/k6.log" --summary-export="$runDir/summary.json" consistency-k6-test.js
$k6Exit = $LASTEXITCODE
node verify-k6-consistency.cjs "$runDir/k6.log"
"k6 exit: $k6Exit; verifier exit: $LASTEXITCODE"
```

La prueba ejecuta un incremento por cada uno de los 100 VUs. Comprueba que el contador final sea el inicial más 100; el verificador revisa además que no haya valores duplicados. Durante la ejecución no debe haber otros clientes incrementando el contador. Ambas salidas deben ser cero.

### Resultado de consistencia

La ejecución guardada en `counter-lab/results/consistency-20261018-133057/` registró:

| Métrica | Resultado |
| --- | --- |
| Contador inicial | 0 |
| Incrementos válidos | 100 |
| Valores duplicados | 0 |
| Contador final | 100 |
| Pods de aplicación que respondieron | 3 |
| Errores HTTP | 0 % |
| p95 HTTP | 301.29 ms |

Estos resultados corresponden a una ejecución sin fallas inyectadas.

### Prueba de fallas del contador

Desde `counter-lab`, iniciar la carga sostenida:

```powershell
k6 run --summary-export=counter-failure-summary.json counter-failure-test.js
```

El script mantiene 20 VUs durante 40 segundos y registra incrementos fallidos y respuestas 503. Durante ese tiempo se puede eliminar un pod de aplicación o el pod central desde otra terminal:

```powershell
# Eliminar un solo pod de aplicación
$appPod = kubectl get pods -l app=distributed-app -o jsonpath='{.items[0].metadata.name}'
if ([string]::IsNullOrWhiteSpace($appPod)) { throw 'No se encontró un pod de aplicación' }
kubectl delete pod $appPod --wait=false

# En una corrida separada, eliminar el contador central
kubectl delete pod -l app=counter-service --wait=false
```

Un reemplazo de la aplicación vuelve a consultar el contador compartido. Un reemplazo del servicio central comienza desde cero y puede causar errores mientras se recupera. El script está disponible para medir este comportamiento; no hay un resumen de esta prueba incluido entre los resultados revisados.

## Canary Deployment

Los manifiestos definen cuatro réplicas v2 y una réplica v3 detrás del mismo Service. Esta proporción busca enviar aproximadamente el 80 % del tráfico a la versión estable y el 20 % a la candidata. El porcentaje observado puede variar por el balanceo y las conexiones.

Desde la raíz del proyecto, con las imágenes v2/v3 construidas y el Deployment v4 detenido:

```powershell
kubectl apply -f deployment-stable.yaml
kubectl apply -f deployment-canary.yaml
kubectl apply -f service.yaml
kubectl rollout status deployment/distributed-app-stable --timeout=120s
kubectl rollout status deployment/distributed-app-canary --timeout=120s
k6 run --summary-export=canary-summary.json canary-test.js
```

El resumen incluye `responses_v2` y `responses_v3`; sus contadores permiten calcular el reparto real. Para retirar la candidata:

```powershell
kubectl scale deployment distributed-app-canary --replicas=0
```

## Resultados de carga

La carpeta `results/` contiene 15 resúmenes para 1, 3 y 10 réplicas con cargas de 20, 50, 100, 200 y 500 VUs. La tabla reúne sus métricas; los escenarios se identifican por los nombres de archivo. Los tiempos están expresados en milisegundos.

| Réplicas | VUs | Solicitudes/s | Errores % | Promedio | p95 | Máximo | Resultado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 20 | 97.80 | 0.000 | 3.24 | 6.94 | 28.09 | PASS |
| 1 | 50 | 244.85 | 0.000 | 2.92 | 6.44 | 94.02 | PASS |
| 1 | 100 | 486.48 | 0.000 | 3.79 | 7.15 | 196.48 | PASS |
| 1 | 200 | 961.89 | 0.000 | 5.91 | 19.48 | 258.68 | PASS |
| 1 | 500 | 2333.59 | 0.253 | 12.04 | 37.43 | 596.05 | PASS |
| 3 | 20 | 97.74 | 0.000 | 3.25 | 6.27 | 47.83 | PASS |
| 3 | 50 | 243.56 | 0.000 | 3.62 | 7.34 | 60.44 | PASS |
| 3 | 100 | 486.86 | 0.000 | 3.37 | 7.35 | 160.39 | PASS |
| 3 | 200 | 965.50 | 0.000 | 5.40 | 15.88 | 254.49 | PASS |
| 3 | 500 | 2370.13 | 0.374 | 8.01 | 25.75 | 550.10 | PASS |
| 10 | 20 | 97.01 | 0.000 | 4.23 | 8.32 | 98.24 | PASS |
| 10 | 50 | 243.14 | 0.000 | 3.95 | 8.44 | 79.50 | PASS |
| 10 | 100 | 487.20 | 0.000 | 3.72 | 8.02 | 163.26 | PASS |
| 10 | 200 | 967.10 | 0.000 | 5.18 | 12.12 | 375.52 | PASS |
| 10 | 500 | 2176.49 | 0.441 | 24.07 | 80.95 | 2175.47 | PASS |

En las tres configuraciones aparecen errores a 500 VUs, aunque todas las corridas cumplen los umbrales guardados. El mayor p95 es de 80.95 ms, en el escenario de 10 réplicas y 500 VUs. Hasta ese nivel de carga no se registró un FAIL por thresholds.

Los resúmenes históricos no incluyen todos los datos del despliegue utilizado. Para nuevas comparaciones se debe mantener la misma imagen, duración y pausa, y guardar también el estado de los pods. Diez pods en Docker Desktop comparten los recursos del equipo; aumentar réplicas no equivale a añadir servidores físicos.

### Ejecutar una prueba de carga

Desde la raíz, con solo stable v2 atendiendo tráfico:

```powershell
kubectl scale deployment distributed-app-stable --replicas=3
kubectl rollout status deployment/distributed-app-stable --timeout=120s
$runDir = 'results/load-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
kubectl get pods -o wide | Out-File "$runDir/pods.txt"
k6 run -e VUS=500 -e SLEEP=0.2 -e OUTPUT_FILE="$runDir/3-replicas-500-vus.json" degradation-test.js
```

Cambiar el número de réplicas y los VUs para repetir los escenarios. `SLEEP` controla la pausa entre iteraciones y `OUTPUT_FILE` indica dónde guardar el resumen. Conservar los resultados anteriores en carpetas separadas.

## Detener el laboratorio

```powershell
kubectl scale deployment --all --replicas=0
kubectl get pods
```

El comando detiene todos los Deployments del namespace actual. Al detener el servicio central se pierde el contador almacenado en memoria.
