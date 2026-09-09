# Visión General del Sistema

Sistema de administración de solicitudes de crédito para una entidad del sector financiero
solidario. Permite registrar solicitudes, evaluarlas, hacerlas avanzar por sus estados y
notificar el hecho a sistemas externos, dejando registro auditable de cada cambio.

---

## 1. Componentes

![Estructura del proyecto](../diagramas/Estructura%20del%20proyecto%20-%20monolito.svg)

| Componente | Responsabilidad |
|---|---|
| **Frontend** | Interfaz de operación: tablero, listado, registro y detalle |
| **API REST** | Contrato público, validación, reglas de negocio y transacciones |
| **Autenticación** | Sesiones de servidor, roles y control de acceso |
| **Créditos** | Ciclo de vida de la solicitud |
| **Simulación** | Cálculo de cuotas y planes de amortización. Sin persistencia |
| **Auditoría** | Bitácora append-only de cambios de estado |
| **Notificaciones** | Bandeja de salida y entrega a sistemas externos |
| **SQL Server** | Persistencia y último nivel de restricciones de integridad |

---

## 2. Tecnologías

| Capa | Elección | Motivo |
|---|---|---|
| Backend | NestJS + TypeScript | Inyección de dependencias, validación declarativa, filtros de excepción globales, guards y tareas programadas vienen resueltos por el framework |
| Persistencia | SQL Server 2022 | Motor transaccional con las restricciones de integridad que el dominio exige |
| Acceso a datos | TypeORM, con las entidades como fuente de verdad | Ver `02_modelo_de_datos.md` |
| Frontend | React + Vite + TypeScript | Tipos compartidos con el contrato de la API |
| Entorno local | Docker Compose | Un solo comando levanta base de datos, API y frontend |
| Pruebas | Jest y Supertest | Unitarias sobre lógica pura, extremo a extremo contra base real |

Dependencias añadidas y su justificación:

- **`decimal.js`** — el cálculo de amortización eleva a potencias. El punto flotante binario
  arrastra error en montos, y los importes se persisten en `DECIMAL(18,2)`: calcular con `number`
  trasladaría el error en lugar de eliminarlo.
- **`argon2`** — derivación de contraseñas resistente a GPU.
- **`helmet`** y limitador de peticiones — endurecimiento del transporte HTTP.

---

## 3. Recorrido de una petición

Cada capa tiene una única responsabilidad:

- **Middleware de `requestId`** — asigna un identificador que acompaña a la petición en todos los
  registros de log y viaja en la respuesta.
- **Guard de sesión** — resuelve la cookie contra el almacén de sesiones y publica el usuario en
  el contexto.
- **Guard de roles** — verifica el rol declarado por el endpoint.
- **`ValidationPipe`** — valida y transforma el DTO. Con `whitelist` y `forbidNonWhitelisted`
  activados, cualquier campo no declarado hace fallar la petición.
- **Controlador** — traduce HTTP a llamadas de dominio. No contiene reglas.
- **Servicio de dominio** — reglas de negocio y control de transacciones.
- **Repositorio** — acceso a datos, con los filtros obligatorios de visibilidad ya aplicados.
- **Interceptor de respuesta** y **filtro de excepciones** — dan forma uniforme a toda salida,
  sea exitosa o no.

El campo `estado` no aparece en ningún DTO de escritura. Solo cambia por el endpoint dedicado,
que valida la transición. Si pudiera colarse en el cuerpo de una creación o de una edición, la
máquina de estados sería evitable con una sola petición.

---

## 4. Organización del código

```
/
├── docker-compose.yml
├── .env.example
├── README.md
├── db/
│   └── esquema_generado.sql     artefacto volcado desde las migraciones
├── api/
│   └── src/
│       ├── main.ts
│       ├── semilla.ts           usuarios y créditos iniciales, solo si la base está vacía
│       ├── config/              variables de entorno validadas y opciones del origen de datos
│       ├── entidades/           fuente de verdad del esquema
│       ├── migraciones/         generadas, más una inicial escrita a mano
│       ├── comun/               filtro de errores, interceptores, requestId
│       ├── auth/                sesiones, guards, roles
│       ├── usuarios/            usuarios y credenciales
│       ├── creditos/            ciclo de vida de la solicitud
│       ├── simulacion/          motor de cálculo, sin dependencias
│       ├── historial/           bitácora append-only
│       └── notificaciones/      bandeja de salida y proceso de entrega
└── web/
    └── src/
        ├── api/                 cliente HTTP tipado
        ├── paginas/             tablero, listado, registro, detalle
        └── componentes/
```

---

## 5. Principios que ordenan el diseño

**Las reglas críticas se verifican en varias capas.** Forma en el DTO, negocio en el servicio,
integridad en la base de datos. La base no puede ser el único control porque no produce mensajes
utilizables ni expresa reglas que cruzan tablas; el DTO no puede ser el único porque otros
procesos escriben en la misma base.

**Lo que cambia y lo que no está definido explícitamente.** Los hechos —identidad, fechas,
bitácora, condiciones ya aprobadas— son inmutables. Los datos vigentes se modifican bajo
condiciones declaradas. Nada se borra físicamente.

**La disponibilidad propia no depende de terceros.** La comunicación con sistemas externos pasa
por una bandeja de salida transaccional: si el tercero está caído, la operación continúa y el
evento se entrega después.

**El estado no vive en el proceso.** Las sesiones están en un almacén compartido, no en memoria.
Cualquier réplica atiende cualquier petición y puede reiniciarse sin afectar a los usuarios.

**El esquema vive en el código.** Las entidades definen la estructura y las migraciones la
aplican. La base de datos no se modifica a mano en ningún entorno.

---

## 5.1 Decisiones y compensaciones

| Decisión | Se gana | Se paga |
|---|---|---|
| `api/src/config/` como carpeta propia | La configuración —validación del entorno y opciones del origen de datos— deja de estar mezclada con lo transversal de `comun/`, que es filtro de errores, interceptores y decoradores | Una carpeta más de primer nivel. `comun/` queda estrictamente para el recorrido de la petición |

---

## 6. Documentos relacionados

| Tema | Documento |
|---|---|
| Estructura de datos y migraciones | `arquitectura/02_modelo_de_datos.md` |
| Seguridad transversal | `arquitectura/03_seguridad.md` |
| Contrato de errores | `arquitectura/04_manejo_de_errores.md` |
| Despliegue | `arquitectura/05_despliegue.md` |
| Crecimiento | `arquitectura/06_escalabilidad.md` |
| Conceptos del negocio | `dominio/01_conceptos_de_credito.md` |
| Detalle de cada módulo | `modulos/` |
