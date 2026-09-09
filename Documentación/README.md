# Módulo de Créditos — Documentación Técnica

Sistema de administración de solicitudes de crédito para una entidad del sector financiero
solidario. Registra solicitudes, las hace avanzar por su ciclo de vida, notifica los hechos a
sistemas externos y deja constancia auditable de cada cambio.

---

## Organización

```
Documentación/
├── README.md                 este índice
├── DECISIONES.md             las diez decisiones que dan forma al sistema
├── dominio/                  conceptos del negocio
├── arquitectura/             estructura del sistema y decisiones transversales
├── modulos/                  funcionamiento de cada módulo
├── operacion/                cómo se ejecuta y cómo se prueba
├── base_de_datos/            esquema de referencia
└── diagramas/                diagramas fuente
```

---

## Índice

### Punto de entrada

| Documento | Contenido |
|---|---|
| [`DECISIONES.md`](DECISIONES.md) | Las diez decisiones técnicas del sistema, con su argumento y su precio. Lo más corto que responde "¿por qué está construido así?" |

### Dominio

| Documento | Contenido |
|---|---|
| [`dominio/01_conceptos_de_credito.md`](dominio/01_conceptos_de_credito.md) | Qué es un crédito, tipos de producto, perfiles de deudor, sistemas de amortización |

### Arquitectura

| Documento | Contenido |
|---|---|
| [`arquitectura/01_vision_general.md`](arquitectura/01_vision_general.md) | Componentes, tecnologías, recorrido de una petición, principios de diseño |
| [`arquitectura/02_modelo_de_datos.md`](arquitectura/02_modelo_de_datos.md) | Entidades, tipos, índices, migraciones y concurrencia optimista |
| [`arquitectura/03_seguridad.md`](arquitectura/03_seguridad.md) | Capas de defensa, CSRF, protección de credenciales, secretos |
| [`arquitectura/04_manejo_de_errores.md`](arquitectura/04_manejo_de_errores.md) | Formato único, catálogo de códigos, criterio de selección |
| [`arquitectura/05_despliegue.md`](arquitectura/05_despliegue.md) | Topología, estado, operación, integración continua |
| [`arquitectura/06_escalabilidad.md`](arquitectura/06_escalabilidad.md) | Límites conocidos y orden de intervención |
| [`arquitectura/07_webhook.md`](arquitectura/07_webhook.md) | Recorrido del evento, reclamación atómica, reintentos y firma en los dos sentidos |

### Módulos

| Documento | Contenido |
|---|---|
| [`modulos/01_autenticacion_y_sesiones.md`](modulos/01_autenticacion_y_sesiones.md) | Sesiones de servidor, cookie, ciclo de vida, roles |
| [`modulos/02_creditos.md`](modulos/02_creditos.md) | Contrato de la API, máquina de estados, reglas de negocio |
| [`modulos/03_simulacion.md`](modulos/03_simulacion.md) | Amortización francesa y alemana, conversión de tasas, redondeo |
| [`modulos/04_auditoria.md`](modulos/04_auditoria.md) | Bitácora append-only, hechos frente a datos vigentes |
| [`modulos/05_notificaciones.md`](modulos/05_notificaciones.md) | Bandeja de salida transaccional, entrega y reintentos |
| [`modulos/06_frontend.md`](modulos/06_frontend.md) | Pantallas, manejo de sesión y traducción de errores |

### Operación

| Documento | Contenido |
|---|---|
| [`operacion/01_entorno_local.md`](operacion/01_entorno_local.md) | Arranque, datos iniciales, trabajo diario, problemas frecuentes |
| [`operacion/02_pruebas.md`](operacion/02_pruebas.md) | Niveles de prueba, casos cubiertos y alcance |
| [`test/README.md`](test/README.md) | Guion de verificación manual con Postman, módulo por módulo |

---

## Diagramas

En `diagramas/`, referenciados desde el documento correspondiente:

| Diagrama | Dónde se usa |
|---|---|
| `Estructura del proyecto - monolito.svg` | `arquitectura/01_vision_general.md` |
| `Diagrama entidad - relacion.svg` | `arquitectura/02_modelo_de_datos.md` |
| `Flujo de solicitud de credito.svg` | `modulos/02_creditos.md` |
| `Webhook.svg` | `modulos/05_notificaciones.md` |
| `Maquina de estados del credito.svg` | `modulos/02_creditos.md` §5 |
| `Criterio de seleccion de codigos HTTP.svg` | `arquitectura/04_manejo_de_errores.md` §4 |

Los dos últimos se editan en Lucid: [máquina de estados](https://lucid.app/lucidchart/4cce95f7-6f65-4cfe-ba33-d1f6fb4bdb84/edit) ·
[códigos HTTP](https://lucid.app/lucidchart/829ee1a8-b5db-49f8-bee0-a6396e39d569/edit). Al cambiarlos hay que
volver a exportar el SVG a esta carpeta.

---

## Decisiones estructurales

Las que condicionan todo lo demás. Cada una está argumentada en su documento.

| Decisión | Dónde |
|---|---|
| Autenticación por sesión de servidor, no por token autocontenido | `modulos/01_autenticacion_y_sesiones.md` |
| El esquema se define en las entidades; la base no se modifica a mano | `arquitectura/02_modelo_de_datos.md` |
| Las reglas de negocio se verifican en tres capas | `arquitectura/01_vision_general.md` |
| Los hechos son inmutables; los datos vigentes se modifican bajo condiciones | `modulos/04_auditoria.md` |
| La notificación a terceros pasa por una bandeja de salida transaccional | `modulos/05_notificaciones.md` |
| El estado no vive en el proceso de la API | `arquitectura/05_despliegue.md` |
| Nada se borra físicamente | `modulos/02_creditos.md` |

---

## Cómo leer esta documentación

Para una vista rápida de por qué el sistema es como es: `DECISIONES.md`.

Para entender el sistema en detalle: `arquitectura/01_vision_general.md`, después el módulo que
interese.

Para trabajar en el código: `operacion/01_entorno_local.md` y `arquitectura/02_modelo_de_datos.md`.

Para integrarse con la API: `modulos/02_creditos.md` y `arquitectura/04_manejo_de_errores.md`.

Cada documento cierra con una tabla de **decisiones y compensaciones**: qué se gana y qué se paga
con cada elección. Ninguna decisión es gratuita y esas tablas dejan explícito el precio.
