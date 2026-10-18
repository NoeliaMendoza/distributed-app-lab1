# Canary Deployment

Ejecutar desde `distributed-app-lab` en PowerShell, con Docker Desktop y Kubernetes activos.
La aplicación usa contadores locales independientes. El reto de contador compartido v4
está conservado en `counter-lab/`, con su Dockerfile y manifiestos originales.
Los manifiestos `deployment.yaml` y `counter-deployment.yaml` de la raíz corresponden
al reto anterior; no usar `kubectl apply -f .` para este reto.

## Construcción y despliegue

```powershell
docker build --build-arg APP_VERSION=v2 -t distributed-app:v2 .
docker build --build-arg APP_VERSION=v3 -t distributed-app:v3 .
docker images distributed-app

kubectl apply -f deployment-stable.yaml
kubectl apply -f deployment-canary.yaml
kubectl apply -f service.yaml
kubectl rollout status deployment/distributed-app-stable --timeout=120s
kubectl rollout status deployment/distributed-app-canary --timeout=120s

# Si el Deployment anterior existe, detener sus réplicas antes de medir.
kubectl scale deployment distributed-app --replicas=0

kubectl get pods -l app=distributed-app -L track
kubectl get endpointslices -l kubernetes.io/service-name=distributed-app-service
Invoke-RestMethod http://localhost:30080/api/info
```

Si `distributed-app` ya no existe, omitir el comando `scale`.
El pod `counter-service` del reto anterior puede seguir ejecutándose: no forma parte
del Service de la aplicación ni se usa en este reto.

## Prueba y porcentajes observados

```powershell
k6 run --out json=canary-results.json canary-test.js

$results = Get-Content .\canary-results.json | ForEach-Object { $_ | ConvertFrom-Json }
$v2 = ($results | Where-Object { $_.type -eq 'Point' -and $_.metric -eq 'responses_v2' } | ForEach-Object { $_.data.value } | Measure-Object -Sum).Sum
$v3 = ($results | Where-Object { $_.type -eq 'Point' -and $_.metric -eq 'responses_v3' } | ForEach-Object { $_.data.value } | Measure-Object -Sum).Sum
$total = $v2 + $v3
if ($total -gt 0) {
    "Stable v2: $v2 respuestas - $([math]::Round($v2 / $total * 100, 2))%"
    "Canary v3: $v3 respuestas - $([math]::Round($v3 / $total * 100, 2))%"
} else {
    'No se registraron respuestas válidas de v2 o v3'
}
```

Se esperan aproximadamente 80% de respuestas v2 y 20% v3. La proporción de pods
no garantiza porcentajes exactos. Guardar las evidencias reales de pods, registros
de k6, resumen de métricas y porcentajes; no reemplazarlas por valores de ejemplo.

## Ampliación y rollback

```powershell
# Aproximadamente 60% de tráfico para v3
kubectl scale deployment distributed-app-stable --replicas=2
kubectl scale deployment distributed-app-canary --replicas=3

# Rollback a v2
kubectl scale deployment distributed-app-stable --replicas=5
kubectl rollout status deployment/distributed-app-stable --timeout=120s
kubectl scale deployment distributed-app-canary --replicas=0
```

Actualizar también los valores `replicas` de los YAML para conservar cualquier
cambio de escala. La prueba inicial de k6 exige respuestas de ambas versiones;
no usar ese criterio después de promover o revertir completamente una versión.

## Volver al contador compartido

Desde `counter-lab/`, construir `distributed-app:v4` y aplicar primero
`counter-deployment.yaml`, después `deployment.yaml` y `service.yaml`.
Antes de medir, escalar `distributed-app-stable` y `distributed-app-canary` a cero
para que sus pods no reciban tráfico del mismo Service.
