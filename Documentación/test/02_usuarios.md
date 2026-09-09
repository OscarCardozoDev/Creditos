# 02 · Usuarios

`UsuariosController` exige `ADMIN` o `ANALISTA` para toda la carpeta
(el caso 01.10 ya comprobó que un `ASOCIADO` no pasa el `RolesGuard`).

**Preparación:** sesión activa como `analista@local` o `admin@local`, con `csrfToken` fresco
(carpeta `01_autenticacion`, caso 1). `POST /api/usuarios/:id/sesiones` de revocación (rol `ADMIN`,
`modulos/01_autenticacion_y_sesiones.md §10`) no está en esta batería: si se quiere ejercitar, es
el mismo patrón de `04_creditos.md` caso 17 aplicado a `DELETE /api/usuarios/:id/sesiones`.

## Casos

| # | Petición | Cuerpo o parámetros | Esperado | Qué demuestra |
|---|---|---|---|---|
| 1 | `POST /api/usuarios` | Datos válidos (detalle abajo) | 201, cuerpo con `usuarioId` | El alta mínima funciona antes de construir nada encima |
| 2 | `POST /api/usuarios` | Repitiendo la `identificacion` del caso 1 | 409 `USUARIO_DUPLICADO` | La identificación es única; el índice de la base respalda esta misma regla |
| 3 | `POST /api/usuarios` | `tipoPersona` con un valor fuera del enum | 400 `VALIDATION_ERROR`, `details` no vacío | `class-validator` rechaza el enum antes de que la regla de negocio se entere |
| 4 | `GET /api/usuarios/{id}` | `id` del caso 1 | 200, mismos datos que se enviaron | La proyección de lectura coincide con lo persistido |
| 5 | `GET /api/usuarios/{uuid inexistente}` | Un UUID con formato válido que no existe | 404 `USUARIO_NOT_FOUND` | Un UUID bien formado no es lo mismo que un recurso existente |
| 6 | `GET /api/usuarios?page=1&limit=5` | — | 200, `meta.page = 1`, `meta.limit = 5`, `data.length ≤ 5` | La paginación común (`comun/dto/paginacion.dto.ts`) se aplica también aquí |
| 7 | `POST /api/usuarios` | Datos válidos + un campo no declarado (`"activo": true`) | 400 `VALIDATION_ERROR` | Confirma `forbidNonWhitelisted`: un campo de más no se ignora, se rechaza |
| 8 | `POST /api/usuarios` | Datos válidos con `"tipoUsuario": "ADMIN"`, autenticado como `ADMIN` | 422 `REGLA_NEGOCIO` | El administrador no se fabrica por la API ni siquiera desde una sesión de administrador: se aprovisiona con la carga inicial |

---

## Detalle

### 1 · Alta válida

```json
POST /api/usuarios
X-CSRF-Token: {{csrfToken}}

{
  "identificacion": "1009988776",
  "nombreRazonSocial": "Laura Torres",
  "tipoPersona": "PERSONA_NATURAL",
  "tipoUsuario": "ASOCIADO"
}
```

`201` con `{ "usuarioId": "...", "identificacion": "1009988776", ... }`. `identificacion` admite
dígitos, letras y guiones, entre 5 y 20 caracteres (`crear-usuario.dto.ts`).

**Script de Tests:**

```javascript
const cuerpo = pm.response.json();
pm.collectionVariables.set('usuarioId', cuerpo.data.usuarioId);
```

### 2 · Identificación duplicada

Repetir el cuerpo del caso 1 exactamente. Responde `409 USUARIO_DUPLICADO`: la comprobación vive en
el servicio (`UsuariosService.exigirIdentificacionLibre`) y, si dos peticiones llegaran a la vez, la
restricción `UQ_Usuarios_Ident` de la base cierra la misma ventana que describe
`modulos/02_creditos.md §7` para créditos.

### 3 · Enum inválido

```json
POST /api/usuarios
{
  "identificacion": "1009988777",
  "nombreRazonSocial": "Otro Usuario",
  "tipoPersona": "PERSONA_ROBOT",
  "tipoUsuario": "ASOCIADO"
}
```

`400 VALIDATION_ERROR`, con `details` listando el error de `tipoPersona` (mensaje de
`class-validator`, no un texto de negocio).

### 4 y 5 · Consulta por id

```
GET /api/usuarios/{{usuarioId}}
```

Debe devolver exactamente lo que el caso 1 registró. Para el caso 5, usar cualquier UUID v4 válido
que no exista en la base (por ejemplo `00000000-0000-4000-8000-000000000000`): responde `404
USUARIO_NOT_FOUND`, distinto del `400` que daría un identificador que ni siquiera es un UUID (ese
lo captura `ParseUUIDPipe` antes de llegar al servicio).

### 6 · Paginación

```
GET /api/usuarios?page=1&limit=5
```

Revisar que `meta` trae `{ page: 1, limit: 5, total, totalPages }` con `totalPages =
Math.ceil(total / 5)`, y que `data` no trae más de 5 filas aunque `total` sea mayor.

### 7 · Campo no declarado

```json
POST /api/usuarios
{
  "identificacion": "1009988778",
  "nombreRazonSocial": "Tercer Usuario",
  "tipoPersona": "PERSONA_NATURAL",
  "tipoUsuario": "ASOCIADO",
  "activo": true
}
```

`activo` no está en `CrearUsuarioDto` — es un campo que el propio contrato de lectura expone, pero
que nadie puede fijar al crear. Con `whitelist: true` y `forbidNonWhitelisted: true` en el
`ValidationPipe` global, la petición entera se rechaza con `400`, no se ignora el campo de más.
