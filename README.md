# Proyecto final de Sistemas Operativos

Nginx recibe las solicitudes del host y las reparte en rotación entre tres contenedores que ejecutan la misma aplicación Flask. Cada respuesta incluye el identificador de la instancia que atendió la solicitud. Prometheus consulta a los backends, al exportador de Nginx y a cAdvisor por la red de Docker Compose.

## Levantar la infraestructura

Con Docker Desktop iniciado en modo de contenedores Linux, o con Docker Engine y Docker Compose en Linux, ejecuta desde la raíz del proyecto:

```sh
docker compose up -d --build
docker compose ps
```

Abre [Nginx](http://127.0.0.1:8080/) desde el navegador del host. Si acabas de iniciar los contenedores, espera unos segundos a que los backends empiecen a aceptar solicitudes.

## Verificar el balanceo

En PowerShell, ejecuta nueve solicitudes y agrupa las respuestas por instancia:

```powershell
1..9 | ForEach-Object {
    (Invoke-RestMethod 'http://127.0.0.1:8080/').instance
} | Group-Object | Select-Object Name, Count
```

Con las tres instancias disponibles y sin otro tráfico, deben aparecer `backend-1`, `backend-2` y `backend-3` con tres solicitudes cada una.

Cada backend expone `/metrics` en su puerto interno `8000`. El contador registra las solicitudes a `/` y el histograma mide el tiempo de ejecución de ese endpoint en el backend.

## Verificar la recolección de métricas

Abre [Targets de Prometheus](http://127.0.0.1:9090/targets). Después de unos segundos deben aparecer cinco objetivos en estado `UP`: tres backends, el exportador de Nginx y cAdvisor. Nginx sirve `stub_status` en el puerto interno `8081` para el exportador.

En la [interfaz de Prometheus](http://127.0.0.1:9090/query), ejecuta estas consultas:

| Consulta | Qué comprueba |
| --- | --- |
| `backend_http_requests_total` | Solicitudes a `/` acumuladas por instancia. |
| `backend_http_request_duration_seconds_count` | Cantidad de mediciones de latencia por instancia. |
| `nginx_up` | Conexión del exportador con `stub_status`; el valor esperado es `1`. |
| `nginx_http_requests_total` | Solicitudes acumuladas que recibió Nginx, incluidas las consultas del exportador. |
| `container_cpu_usage_seconds_total{container_label_com_docker_compose_project="proyecto-final-so"}` | Tiempo de CPU acumulado por contenedor. |
| `container_memory_working_set_bytes{container_label_com_docker_compose_project="proyecto-final-so"}` | Memoria de trabajo de los contenedores del proyecto. |
| `container_network_receive_bytes_total{container_label_com_docker_compose_project="proyecto-final-so"}` | Bytes recibidos por interfaz de red. |
| `container_fs_writes_bytes_total{container_label_com_docker_compose_project="proyecto-final-so"}` | Bytes escritos por contenedor y dispositivo. |

En Docker Desktop con `overlayfs`, cAdvisor usa el socket de Docker y el de containerd para identificar los contenedores. En este entorno se verificó la E/S de disco con `container_fs_writes_bytes_total`. La serie puede aparecer cuando el contenedor registra actividad de disco. `container_fs_usage_bytes`, que mide espacio ocupado, no devolvió datos por contenedor en esta configuración.

Para detener el entorno, ejecuta `docker compose down`. El volumen `prometheus-data` conserva las métricas al recrear los contenedores.

## Ver el dashboard de Grafana

Abre [Infraestructura Docker](http://127.0.0.1:3000/d/infraestructura-so/infraestructura-docker). En el primer acceso, usa las credenciales iniciales de Grafana (`admin` / `admin`) y cambia la contraseña cuando se te solicite. La contraseña nueva se guarda en el volumen `grafana-data`.

Docker Compose aprovisiona el dashboard y conecta Grafana con Prometheus automáticamente. Selecciona **Últimos 15 minutos** en el selector de tiempo y ejecuta el comando de verificación del balanceo para ver actividad en los paneles. El p95 mide el tiempo de ejecución del endpoint dentro de Flask. Una prueba de carga desde Windows medirá también el paso por Nginx y la red.

## Ejecutar la prueba de carga desde Windows

Instala k6 en Windows y verifica que `k6 version` funcione en PowerShell. Con los servicios activos, ejecuta desde la raíz del proyecto:

```powershell
New-Item -ItemType Directory -Force pruebas/resultados | Out-Null
k6 run -e TASA=25 --summary-export pruebas/resultados/25rps.json pruebas/carga.js
Start-Sleep -Seconds 20
k6 run -e TASA=150 --summary-export pruebas/resultados/150rps.json pruebas/carga.js
```

Cada ejecución dura 30 segundos y realiza una solicitud a `/` por iteración. k6 informa la latencia HTTP, las solicitudes fallidas, las iteraciones descartadas y el reparto de respuestas por instancia. Mantén abierto el dashboard de Grafana para comparar el tráfico y el uso de recursos durante ambas fases. En Windows puedes instalar la herramienta con `winget install k6 --source winget` o usar el binario portátil. [Instalación oficial de k6](https://grafana.com/docs/k6/latest/set-up/install-k6/)

### Resultados de la ejecución local

Medición del 16 de noviembre de 2026 con k6 2.4.0 en Windows y Docker Desktop. Se enviaron nueve solicitudes de calentamiento antes de cada fase y se esperaron 20 segundos entre fases.

| Tasa objetivo | Tasa observada | Solicitudes | Reparto por backend (1 / 2 / 3) | p95 HTTP | p99 HTTP | Máximo HTTP | Errores HTTP | Iteraciones descartadas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 25 req/s | 25,03 req/s | 751 | 250 / 250 / 251 | 6,11 ms | 7,97 ms | 13,80 ms | 0 | 0 |
| 150 req/s | 150,01 req/s | 4.501 | 1.500 / 1.501 / 1.500 | 4,85 ms | 5,81 ms | 23,57 ms | 0 | 0 |

Prometheus registró 25,11 y 150,02 req/s en una muestra de cada fase, con una ventana de 15 segundos sobre los contadores de los tres backends. En ambas fases, la diferencia entre réplicas fue de una solicitud. El p95 bajó en la segunda ejecución y el máximo subió. Harían falta varias repeticiones alternando el orden de las fases para atribuir el cambio de latencia a la carga.
