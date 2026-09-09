# 01 · Autenticación y sesiones

Contrato completo en
[`modulos/01_autenticacion_y_sesiones.md`](../modulos/01_autenticacion_y_sesiones.md). A partir de
esta carpeta, toda ruta sin `@Publico()` exige la cookie de sesión — por eso va primera en el orden
de ejecución (`README.md §5`).

**Preparación:** ninguna. Es la primera carpeta y parte de una base recién sembrada.

## Casos

| #     | Petición                                                          | Cuerpo o parámetros                                             | Esperado                                                                      | Qué demuestra                                                                                |
| ----- | ----------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1     | `POST /api/auth/login`                                            | `{ "correo": "analista@local", "password": "Desarrollo.2026" }` | 200; `Set-Cookie` de `__Host-sid` con `HttpOnly`, `Secure`, `SameSite=Strict` | La sesión se abre con la cookie blindada que describe el módulo                              |
| 2     | `POST /api/auth/login`                                            | Mismo correo, `password` incorrecta                             | 401 `CREDENCIALES_INVALIDAS`                                                  | Un intento fallido no distingue causa en el código de error                                  |
| 3     | `POST /api/auth/login`                                            | Correo inexistente, cualquier `password`                        | 401 `CREDENCIALES_INVALIDAS`, **mensaje idéntico** al caso 2                  | Evita que el login sirva de oráculo para enumerar usuarios                                   |
| 4     | `GET /api/auth/yo`                                                | Con la cookie del caso 1                                        | 200, `{ usuarioId, nombre, rol }`                                             | La sesión resuelve identidad y rol sin que el cliente los declare                            |
| 5     | `GET /api/auth/yo`                                                | Sin cookie (pestaña nueva o cookie borrada)                     | 401 `NO_AUTENTICADO`                                                          | El guard global exige sesión salvo en rutas marcadas `@Publico()`                            |
| 6     | `POST /api/auth/logout` sin `X-CSRF-Token`                        | —                                                               | 403 `CSRF_INVALIDO`                                                           | El doble envío de token cierra el hueco que abre autenticar por cookie                       |
| **7** | `POST /api/auth/logout`, luego `GET /api/auth/yo`                 | Con `X-CSRF-Token` en el primero                                | 204; después 401 `SESION_REVOCADA`                                            | **Revocación inmediata: la razón de elegir sesión de servidor sobre un token autocontenido** |
| 8     | `POST /api/auth/login` dos veces seguidas                         | Mismas credenciales, dos peticiones                             | Dos filas en `Sesiones` con `token_hash` distintos                            | Cada login rota el identificador; no hay reuso ni fijación de sesión                         |
| 9     | Adulterar la cookie `__Host-sid` a mano, luego `GET /api/auth/yo` | Cambiar un carácter del valor                                   | 401 `SESION_INVALIDA`                                                         | Un identificador que no resuelve ninguna fila no es lo mismo que uno vencido o revocado      |
| 10    | `GET /api/usuarios` autenticado como `asociado@local`             | —                                                               | 403 `SIN_PERMISO`                                                             | El `RolesGuard` corta antes de llegar al servicio: el rol no alcanza la ruta                 |

---

## Detalle

### 1 · Login correcto

```json
POST /api/auth/login
{ "correo": "analista@local", "password": "Desarrollo.2026" }
```

Responde `200` (no `201`: no crea un recurso direccionable, abre un estado de sesión) con
`{ "success": true, "data": { "expiraEn": "2026-09-08T22:03:11.482Z" } }` y dos cookies:

- `__Host-sid`: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, `Max-Age` igual al vencimiento
  absoluto de 8 horas.
- `csrf-token`: mismo resto de atributos, **sin** `HttpOnly` — el frontend necesita leerla.

Verificar el `Set-Cookie` en la pestaña *Headers* de la respuesta, no en el *cookie jar* ya
procesado por el cliente.

**Script de Tests**, para que el resto de la colección pueda firmar sus escrituras:

```javascript
const csrf = pm.cookies.get('csrf-token');
if (csrf) pm.collectionVariables.set('csrfToken', csrf);
```

### 2 y 3 · Credenciales inválidas

```json
POST /api/auth/login
{ "correo": "analista@local", "password": "incorrecta" }
```

```json
POST /api/auth/login
{ "correo": "no-existe@local", "password": "Desarrollo.2026" }
```

Ambas responden el mismo `{ "code": "CREDENCIALES_INVALIDAS", "message": "..." }`. Comparar el
campo `message` de las dos respuestas byte a byte: si difiere, el endpoint ya filtra si el correo
existe.

### 6 · Escritura sin cabecera anti-CSRF

`POST /api/auth/logout` con la cookie de sesión puesta pero **sin** `X-CSRF-Token` en la cabecera.
Responde `403 CSRF_INVALIDO` y, a diferencia del caso 7, la sesión sigue viva después: el guard
corta antes de que el controlador la revoque. Confirmarlo con un `GET /api/auth/yo` inmediato, que
debe seguir dando `200`.

### 7 · Logout y revocación inmediata

```
POST /api/auth/logout
X-CSRF-Token: {{csrfToken}}
```

Responde `204`. La petición `GET /api/auth/yo` que sigue, con la misma cookie que el cliente
todavía conserva, debe dar `401 SESION_REVOCADA` — no `SESION_INVALIDA`: la fila existe, pero su
`revocada_en` ya no es nula. Es la comprobación de que "cerrar sesión" en este sistema apaga el
acceso en el servidor, no solo le pide al navegador que olvide una cookie.

> **Nota de secuencia:** tras este caso no queda ninguna sesión activa. El caso 8 vuelve a hacer
> login, así que el resto de la colección sigue funcionando; solo hay que recordar que el
> `csrfToken` guardado en la variable de colección queda obsoleto hasta el próximo login.

### 8 · Rotación de token al autenticar

Repetir el login del caso 1 dos veces con las mismas credenciales, sin cerrar sesión entre medio.
Verificar en la base (o con `GET /api/auth/sesiones` tras el segundo login) que hay dos filas con
`token_hash` distintos y ambas sin `revocada_en`. Ninguna sesión previa se invalida al crear una
nueva: el usuario puede tener varios dispositivos abiertos a la vez.

### 9 · Cookie adulterada

En el *cookie jar* de Postman, editar el valor de `__Host-sid` cambiando un carácter cualquiera.
`GET /api/auth/yo` debe responder `401 SESION_INVALIDA`: el SHA-256 de ese valor no coincide con
ningún `token_hash` almacenado. Volver a hacer login después de este caso para dejar la colección
en un estado usable.

### 10 · Rol insuficiente

Hacer login como `asociado@local` / `Desarrollo.2026` (repetir el script del caso 1 para refrescar
`csrfToken`) y llamar `GET /api/usuarios`. El controlador de usuarios exige `ADMIN` o `ANALISTA`
a nivel de clase; `ASOCIADO` no está en la lista y el `RolesGuard` corta con `403 SIN_PERMISO` antes
de que el servicio se entere de la petición.

> **Nota de secuencia:** tras este caso conviene volver a autenticarse como `analista@local` o
> `admin@local` antes de continuar con `02_usuarios.md`, que exige uno de esos dos roles para casi
> todos sus casos.
