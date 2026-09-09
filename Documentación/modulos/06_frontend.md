# Módulo Frontend

Interfaz web para operar el módulo de créditos. Cuatro pantallas más la de acceso.

---

## 1. Composición

| Elemento | Elección | Razón |
|---|---|---|
| Base | React + Vite + TypeScript | Tipos compartidos con el contrato de la API |
| Rutas | `react-router-dom` | Cinco rutas |
| Datos del servidor | TanStack Query | Cache, reintentos, estados de carga y error, invalidación tras escribir |
| Estado global | Ninguno | Ver más abajo |
| Formularios | `react-hook-form` + `zod` | El mismo esquema valida y tipa |
| Estilos | Tailwind | Sin CSS propio que mantener |
| Gráficas | Ninguna | El tablero son conteos, no series |

**Sin gestor de estado global.** Casi todo el estado de esta aplicación pertenece al servidor:
créditos, historial, totales. TanStack Query ya lo administra con su cache. Lo único
verdaderamente local es la identidad del usuario, y con autenticación por cookie ni siquiera hay
un token que guardar — el navegador la envía sola y el usuario actual se obtiene de
`GET /api/auth/yo`. Añadir Redux o Zustand aquí sería una capa sin contenido.

---

## 2. Rutas

| Ruta | Consume |
|---|---|
| `/login` | `POST /api/auth/login` |
| `/` | `GET /api/creditos/resumen` |
| `/creditos` | `GET /api/creditos?...` |
| `/creditos/nuevo` | `POST /api/simulacion`, `POST /api/creditos` |
| `/creditos/:id` | `GET /api/creditos/:id`, `GET /api/creditos/:id/historial` |

---

## 3. Las pantallas

### 3.1 Tablero

Una fila de tarjetas: total de créditos y una por estado. Debajo, monto total solicitado y monto
aprobado.

Consume **un solo endpoint**, no seis consultas filtradas. El conteo se resuelve en SQL con un
`GROUP BY estado` que aprovecha `IX_Creditos_Estado_Fecha`; traer las filas al navegador para
contarlas allí deja de funcionar en cuanto la tabla crece.

Cada tarjeta enlaza al listado ya filtrado por ese estado. Convierte el tablero en un punto de
entrada en lugar de un adorno.

### 3.2 Listado

Tabla con número de crédito, asociado, valor, tipo, estado y fecha, más una columna de acciones.

- Filtros por estado, tipo y rango de fechas; búsqueda por texto con espera de 300 ms entre
  pulsaciones, para no disparar una petición por tecla.
- **Los filtros viven en la URL** (`?estado=APROBADO&page=2`), no en el estado del componente.
  Así el enlace se puede compartir, la recarga no pierde el filtro y el botón atrás del navegador
  se comporta como el usuario espera.
- Paginación con los datos de `meta`, mostrando "1–20 de 137".
- Orden por columna, usando el mismo parámetro `sort` que acepta la API.
- Los montos se formatean con `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' })`,
  que ya trae el navegador.
- El estado se muestra como etiqueta de color: verde para aprobado y desembolsado, rojo para
  rechazado, gris para cancelado, ámbar para en estudio, azul para solicitado.

### 3.3 Registro de solicitud

Formulario con los campos de la solicitud. Al completar monto, tipo y número de cuotas, consulta
`POST /api/simulacion` y muestra **la cuota mensual estimada** antes de enviar. El solicitante ve
a qué se compromete antes de confirmarlo.

- El selector de tipo de crédito se restringe según el perfil del asociado. Si el perfil aún no
  se conoce, se muestran todos y el servidor responde `422` con un mensaje legible.
- La tasa aparece en solo lectura, con el valor de política.
- El botón de envío se deshabilita mientras la petición está en curso. Es la defensa del cliente
  contra el doble clic; la del servidor es el índice único anti-duplicado.
- Al registrar con éxito, aviso de confirmación y redirección al detalle.

### 3.4 Detalle

- Todos los campos del crédito, más cuota calculada y total a pagar.
- Línea de tiempo del historial: estado anterior, estado nuevo, usuario, fecha y observación.
- Acciones de cambio de estado que muestran **solo las transiciones válidas** desde el estado
  actual. La lista la envía el backend en la propia respuesta del detalle
  (`transicionesPermitidas: ["APROBADO", "RECHAZADO", "CANCELADO"]`), de modo que la máquina de
  estados no se reimplementa en el navegador. Si cambia en el servidor, la interfaz la sigue sin
  modificar una línea.
- Rechazar y cancelar abren un diálogo que exige observación, reflejando la regla del servidor.

---

## 4. Sesión en el cliente

La autenticación por cookie impone condiciones concretas:

- Todas las peticiones se envían con `credentials: 'include'`. Sin eso el navegador no adjunta la
  cookie y la API responde 401 de forma sistemática.
- Las peticiones de escritura copian el valor de la cookie `csrf-token` a la cabecera
  `X-CSRF-Token`.
- En desarrollo, el `proxy` de Vite hace que frontend y API compartan origen. Es preferible a
  configurar CORS con credenciales, porque reproduce la situación de producción, donde ambos van
  detrás del mismo dominio.
- No hay token que guardar ni renovar: la sesión se prorroga con el uso y vence sola. El cliente
  no administra vigencias.
- Un `401` en cualquier punto significa que la sesión terminó. El interceptor redirige a
  `/login` con el mensaje correspondiente.

---

## 5. Traducción de errores

Un interceptor único convierte el formato de error de la API en algo accionable:

| Respuesta | Qué ve el usuario |
|---|---|
| 400 `VALIDATION_ERROR` | El mensaje se pinta **bajo cada campo**, usando `details`; no un aviso genérico |
| 401 | Redirección a `/login` con "Tu sesión terminó" |
| 403 | "No tienes permisos para esta acción" |
| 404 | Pantalla de crédito no encontrado, con enlace al listado |
| 409 `CREDITO_DUPLICADO` | "Ya existe una solicitud igual en trámite", con enlace a la existente |
| 409 `CONCURRENCIA_CONFLICTO` | "Otro usuario modificó este crédito", con botón de recargar |
| 422 | El mensaje de la regla de negocio, tal como lo envía la API |
| 500 | "Ocurrió un error inesperado", junto al `requestId` para poder reportarlo |

Mostrar el `requestId` en pantalla permite que un usuario reporte un problema con un dato que
lleva directo a la traza del servidor.

**Cada pantalla contempla tres estados**: cargando (esqueleto del contenido, no un indicador
centrado), vacío ("No hay créditos con estos filtros", con botón para limpiarlos) y error
(mensaje con botón de reintentar). Su ausencia es lo primero que se nota al usar la aplicación.

---

## 6. Validación repetida en cliente y servidor

El esquema `zod` del formulario repite reglas que ya están en el DTO del backend. Es duplicación
buscada, y cada copia tiene una función distinta:

- La del cliente da respuesta inmediata, sin ida y vuelta al servidor.
- La del servidor es la que realmente protege, porque el código del navegador está en manos del
  usuario y cualquiera puede enviar peticiones sin pasar por la interfaz.

El servidor nunca confía en la validación del cliente.

---

## 7. Alcance

Fuera de alcance, de forma deliberada: modo oscuro, internacionalización y animaciones.

Accesibilidad al nivel base: cada campo con su etiqueta asociada, foco visible y elementos
interactivos que son realmente `<button>`. Hacerlo desde el principio cuesta menos que
corregirlo después.

---

## 8. Decisiones y compensaciones

| Decisión | Se gana | Se paga |
|---|---|---|
| Sin gestor de estado global | Menos capas; la cache de Query ya cubre el caso | Al aparecer estado compartido no derivado del servidor habrá que introducir algo |
| Filtros en la URL | Enlaces compartibles, recarga y botón atrás correctos | Sincronizar la URL con los controles cuesta algo más de código |
| Transiciones enviadas por el backend | Una sola definición de la máquina de estados | Una petición más antes de poder pintar las acciones |
| Tablero con endpoint de resumen | Constante frente al volumen de datos | Un endpoint específico que mantener |
| Validación duplicada | Respuesta inmediata sin sacrificar seguridad | Dos definiciones que se deben mantener alineadas |
| Sin pruebas automatizadas de interfaz | Menos superficie que mantener | Las regresiones visuales se detectan usando la aplicación |
