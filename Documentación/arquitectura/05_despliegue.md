# Despliegue

Cómo se ejecuta el sistema en producción y qué hace falta para operarlo.

---

## 1. Topología

De afuera hacia adentro:

- **Proxy inverso** en el borde: termina TLS y aplica el límite de peticiones. Es el único
  componente expuesto a internet.
- **Frontend estático** servido desde CDN.
- **N réplicas de la API**, detrás del balanceador, todas equivalentes.
- **SQL Server primario**, al que escriben todas las réplicas.
- **Réplica de lectura**, para listados, tablero y reportes.
- **Proceso de entrega de notificaciones**, que lee la bandeja de salida y llama al sistema
  externo.

El diagrama de la sección 1 de `arquitectura/01_vision_general.md` muestra la disposición de los
módulos dentro del proceso.

---

## 2. Estado: qué lo conserva y qué no

| Componente | Estado | Consecuencia operativa |
|---|---|---|
| Frontend | Ninguno | Archivos estáticos servidos desde CDN; se replica sin límite |
| **API** | **Ninguno en el proceso** | Las sesiones viven en la base compartida, no en memoria. Cualquier réplica atiende cualquier petición y puede reiniciarse sin expulsar usuarios |
| Proceso de entrega | Ninguno en el proceso | Su estado está en la tabla `Notificaciones`. Si una instancia muere, otra retoma los pendientes |
| **SQL Server** | **Sí** | Es el componente que realmente conserva estado y el que condiciona la disponibilidad |
| Almacenamiento de documentos | Sí | Debe ser un servicio externo, nunca el disco local del contenedor: con dos réplicas, el archivo que sube una no lo ve la otra |

La distinción importante: la API **no es sin estado en sentido estricto** —consulta el almacén de
sesiones en cada petición— pero **no guarda estado en el proceso**. Esa es la propiedad que
permite escalar horizontalmente, reiniciar sin coordinación y reemplazar instancias sin
consecuencias. Sesiones en memoria del proceso romperían las tres cosas.

---

## 3. Entorno local

`docker-compose.yml` levanta tres servicios:

| Servicio | Imagen | Notas |
|---|---|---|
| `sqlserver` | `mcr.microsoft.com/mssql/server:2022-latest` | Volumen persistente; contraseña por variable de entorno |
| `api` | Construida desde `api/` | Espera a que la base esté sana; aplica migraciones al arrancar |
| `web` | Construida desde `web/`, servida por nginx | Depende de `api` |

Detalles que evitan problemas recurrentes:

- **Chequeo de salud real en la base** (`sqlcmd -Q "SELECT 1"`), no una espera fija. Declarar
  dependencia sin chequeo solo espera a que el contenedor exista, no a que el motor acepte
  conexiones: es la causa habitual de que el primer arranque falle y el segundo funcione.
- **Construcción en varias etapas** en la API: se compila con las dependencias de desarrollo y la
  imagen final solo contiene el resultado y las de producción.
- **`/health` verifica también la base.** Un chequeo que solo confirma que el proceso vive declara
  sano un servicio incapaz de atender.
- **Ninguna contraseña escrita en el archivo de composición.**

El objetivo es que clonar el repositorio, copiar `.env.example` a `.env` y levantar el entorno
sea suficiente.

---

## 4. Operación en producción

| Aspecto | Definición |
|---|---|
| **HTTPS** | TLS terminado en el proxy, certificado con renovación automática, HSTS activo, redirección desde HTTP |
| **Secretos** | Gestor de secretos externo, inyectados como variables de entorno al iniciar. Nunca en la imagen ni en el repositorio |
| **Respaldos** | Completo diario, diferencial cada 6 horas y log de transacciones cada 15 minutos, lo que acota la pérdida máxima a 15 minutos. **La restauración se prueba mensualmente**: un respaldo que nunca se restauró no es un respaldo, es una suposición |
| **Registros** | JSON estructurado a salida estándar, recogido por el orquestador y enviado a un agregador. Correlacionables de extremo a extremo por `requestId` |
| **Chequeos de salud** | Separar `/health/live` —el proceso funciona— de `/health/ready` —además la base responde—. El balanceador usa `ready`, el orquestador usa `live`. El sistema hoy expone un único `GET /health` que ya consulta la base: cumple el papel de `ready`, y separarlo es el paso previo a operar con orquestador |
| **Métricas** | Frecuencia, errores y duración por endpoint; profundidad de la cola de notificaciones pendientes; frecuencia de reintentos; conexiones activas; espacio en disco de la base |
| **Alertas** | Errores 5xx sobre 1 %, percentil 95 de latencia sobre 1 segundo, notificaciones pendientes por encima del umbral durante 10 minutos, respaldo fallido |

### Sobre `live` y `ready`

Confundirlos tiene una consecuencia concreta: si el orquestador usa el chequeo que consulta la
base para decidir reinicios, un pico de latencia en la base reinicia todas las réplicas a la vez
y convierte una degradación temporal en una caída total.

- `live` responde "el proceso funciona, no me reinicies".
- `ready` responde "puedo atender tráfico, mándame peticiones".

Una instancia con la base momentáneamente inaccesible debe dejar de recibir tráfico, no morir.

---

## 5. Integración y entrega continuas

Las migraciones se aplican **antes** de arrancar la versión nueva del código, con respaldo
previo, y deben ser compatibles hacia atrás: durante un despliegue gradual conviven dos versiones
del código contra un mismo esquema.

De ahí la regla de dos fases para cambios destructivos: agregar la columna nueva en un despliegue
y retirar la antigua en el siguiente, nunca en el mismo. Entre ambos, las dos versiones del
código funcionan.

Las imágenes se etiquetan con el identificador del commit, lo que permite volver a una versión
anterior cambiando la etiqueta.

---

## 6. Configuración

La aplicación valida su configuración al arrancar y **no inicia si falta una variable
obligatoria**. Arrancar con un secreto vacío produce firmas y sesiones que cualquiera puede
reproducir; fallar en el arranque hace visible el problema de inmediato.

Variables previstas:

```
NODE_ENV=production
PORT=3000

DB_HOST=
DB_PORT=1433
DB_NAME=Creditos
DB_USER=
DB_PASSWORD=

SESSION_COOKIE_NAME=__Host-sid
SESSION_INACTIVIDAD_MIN=30
SESSION_ABSOLUTA_HORAS=8

WEBHOOK_URL=
WEBHOOK_SECRET=
WEBHOOK_TIMEOUT_MS=5000
WEBHOOK_MAX_INTENTOS=8
WORKER_INTERVALO_MS=10000

CORS_ORIGINS=
```

El repositorio publica `.env.example` con estas claves y sin un solo valor real.

---

## 7. Decisiones y compensaciones

| Decisión | Se gana | Se paga |
|---|---|---|
| Sesiones en la base compartida | Réplicas intercambiables y desechables | Una consulta por petición contra el componente que conserva estado |
| Proceso de entrega dentro de la API | Un despliegue menos que operar | Comparte CPU con el camino de las peticiones |
| Migraciones como paso previo al despliegue | El esquema nunca queda por detrás del código | Los cambios destructivos exigen dos despliegues |
| Respaldos con prueba de restauración | Se sabe que funcionan | Consume tiempo de operación cada mes |
| `live` y `ready` separados | Una base lenta no provoca reinicios en cascada | Dos endpoints y dos configuraciones que mantener |
| Imágenes etiquetadas por commit | Reversión inmediata | El registro de imágenes crece y hay que depurarlo |
