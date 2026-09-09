# web — Interfaz del módulo de créditos

React 19 + TypeScript + Vite + Tailwind 4. Las cinco pantallas de
`Documentación/modulos/06_frontend.md`, conectadas a la API real.

```bash
bun install
bun run dev      # http://localhost:5173
bun run build    # tsc -b && vite build
bun run lint
```

## Estructura

Fijada en `Documentación/arquitectura/01_vision_general.md §4`. No se añaden capas.

```
src/
├── api/            contrato y cliente HTTP · ninguna pantalla hace fetch
│   ├── tipos.ts    DTO, enums, catálogo de errores, parámetros por producto
│   ├── cliente.ts  envoltura de fetch: cookies, CSRF, sobre {success,data,meta}, ErrorApi
│   ├── auth.ts     login, logout, /yo, sesiones
│   ├── creditos.ts alta, listado, resumen, detalle, historial, cuotas, pagos, estado, borrado
│   ├── usuarios.ts alta y consulta de usuarios
│   └── simulacion.ts
├── componentes/    armazón, sesión, primitivas de interfaz y formateo
└── paginas/        una por ruta
```

## Rutas

| Ruta | Pantalla | Consume |
|---|---|---|
| `/login` | Acceso | `POST /api/auth/login` |
| `/` | Tablero | `GET /api/creditos/resumen` |
| `/creditos` | Listado | `GET /api/creditos?...` |
| `/creditos/nuevo` | Registro | `POST /api/simulacion`, `POST /api/creditos` |
| `/creditos/:id` | Detalle | `GET /api/creditos/:id`, `GET /:id/historial` |
| `/usuarios` | Usuarios (ADMIN, ANALISTA) | `GET /api/usuarios`, `POST /api/usuarios` |

## Diseño

Swiss Industrial Print. Los doce tokens de color viven en `src/index.css` (`@theme`)
y replican la colección `tokens` del archivo de Figma. La escala de radios está
vaciada a propósito: `--radius-*: initial` elimina las utilidades `rounded-*` del
proyecto, de modo que ningún ángulo redondeado entra por descuido.

## Estado

Las cinco pantallas consumen la API real. No queda ningún dato de relleno.

| Pieza | Cómo funciona |
|---|---|
| Sesión | `GET /auth/yo` con TanStack Query. La guardia vive en `Armazon`: sin sesión, redirige a `/login` conservando el destino |
| Acceso | `POST /auth/login`. El navegador administra la cookie `__Host-`; no hay token que guardar |
| CSRF | `cliente.ts` copia la cookie `csrf-token` a `X-CSRF-Token` en `POST`, `PATCH` y `DELETE` |
| Roles | `ANALISTA` y `ADMIN` ven los botones de transición y el enlace de Usuarios; el `ASOCIADO` ve el detalle en solo lectura y su solicitud se registra a su propio nombre. El recorte de sus créditos lo impone el repositorio del servidor |
| Caché | Una escritura invalida `['creditos']`, así que tablero, listado y detalle se refrescan solos |
| Estados | Cada pantalla contempla cargando (esqueleto con la forma del contenido), vacío y error, según §5 del doc |

## Credenciales de desarrollo

Las crea `npm run seed` en la API: `admin@local`, `analista@local`, `asociado@local`,
todas con la contraseña `Desarrollo.2026`.

## Pendiente

- `react-hook-form` + `zod` en el formulario de registro. Hoy la validación inmediata
  se limita a deshabilitar el envío; el 400 del servidor ya se pinta bajo cada campo
- `PATCH /creditos/:id` con `If-Match`: el cliente lo soporta, falta la pantalla de edición
- `GET /creditos/:id/cuotas` se consulta en el detalle solo para los totales; falta la
  tabla completa del plan y el registro de pagos (`POST /:id/cuotas/:numero/pago`)
- `DELETE /creditos/:id` para ADMIN
- Desactivar usuarios y cerrar sus sesiones desde la pantalla de Usuarios: el cliente ya
  expone `cerrarSesiones()`, falta el botón
