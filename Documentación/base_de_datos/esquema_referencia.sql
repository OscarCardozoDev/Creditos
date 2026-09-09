/* ============================================================================
   Modulo de Creditos - Esquema SQL Server

   REFERENCIA DE LECTURA, NO FUENTE DE VERDAD.
   El esquema efectivo lo definen las entidades TypeORM en api/src/entidades/ y
   lo aplican las migraciones. Este archivo documenta el diseno y su porque.
   Ver arquitectura/02_modelo_de_datos.md.

   Convenciones:
   - Montos DECIMAL(18,2), tasas DECIMAL(9,6). Nunca FLOAT/REAL.
   - Fechas DATETIME2(3) en UTC (SYSUTCDATETIME()). DATE no guarda hora.
   - Los "ENUM" son CHECK constraints: SQL Server no tiene tipo ENUM nativo.
   - tipo_usuario (rol: ADMIN/ANALISTA/ASOCIADO) y tipo_persona (NATURAL/JURIDICA)
     son ejes distintos: el rol dice quien usa la app, tipo_persona que es el deudor.
   - Historial y Notificaciones usan BIGINT IDENTITY: son tablas de log,
     insert-heavy y no se exponen por la API.
   ========================================================================= */

IF DB_ID('Creditos') IS NULL
    CREATE DATABASE Creditos;
GO
USE Creditos;
GO

-- Lectores no bloquean escritores: el dashboard agrega sobre la misma tabla
-- donde se insertan creditos.
ALTER DATABASE Creditos SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
GO

/* ---------------------------------------------------------------- Usuarios */
CREATE TABLE dbo.Usuarios (
    usuario_id      UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Usuarios_Id DEFAULT NEWSEQUENTIALID(),
    identificacion  VARCHAR(20)      NOT NULL,   -- VARCHAR: ceros a la izquierda y digito de verificacion
    nombre_razon_social NVARCHAR(150) NOT NULL,   -- persona natural: nombre completo; juridica: razon social
    tipo_persona    VARCHAR(20)      NOT NULL,   -- naturaleza juridica del asociado
    tipo_usuario    VARCHAR(10)      NOT NULL,   -- rol en el sistema (ortogonal a tipo_persona)
    creado_en       DATETIME2(3)     NOT NULL CONSTRAINT DF_Usuarios_Creado DEFAULT SYSUTCDATETIME(),
    actualizado_en  DATETIME2(3)     NOT NULL CONSTRAINT DF_Usuarios_Act    DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_Usuarios       PRIMARY KEY (usuario_id),
    CONSTRAINT UQ_Usuarios_Ident UNIQUE (identificacion),
    CONSTRAINT CK_Usuarios_Rol     CHECK (tipo_usuario IN ('ADMIN','ANALISTA','ASOCIADO')),
    CONSTRAINT CK_Usuarios_Persona CHECK (tipo_persona IN ('PERSONA_NATURAL','PERSONA_JURIDICA'))
);
GO

/* ----------------------------------------------------------- Credenciales */
-- 1:1 opcional con Usuarios: un ASOCIADO no necesariamente tiene login.
CREATE TABLE dbo.Credenciales (
    usuario_id      UNIQUEIDENTIFIER NOT NULL,
    correo          VARCHAR(254)     NOT NULL,
    password_hash   VARCHAR(255)     NOT NULL,   -- hash argon2id/bcrypt, nunca la clave
    creado_en       DATETIME2(3)     NOT NULL CONSTRAINT DF_Cred_Creado DEFAULT SYSUTCDATETIME(),
    actualizado_en  DATETIME2(3)     NOT NULL CONSTRAINT DF_Cred_Act    DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_Credenciales        PRIMARY KEY (usuario_id),
    CONSTRAINT FK_Credenciales_Usuario FOREIGN KEY (usuario_id) REFERENCES dbo.Usuarios (usuario_id),
    CONSTRAINT UQ_Credenciales_Correo UNIQUE (correo)
);
GO

/* ---------------------------------------------------------------- Sesiones */
-- Autenticacion por sesion de servidor: el identificador que viaja al navegador
-- es opaco y aqui solo se guarda su SHA-256, igual que con las contrasenas.
-- Un volcado de esta tabla no entrega sesiones utilizables.
-- Dos vencimientos distintos: ultimo_acceso sostiene el de inactividad,
-- expira_en el absoluto, que no se prorroga.
CREATE TABLE dbo.Sesiones (
    token_hash      CHAR(64)         NOT NULL,   -- SHA-256 en hexadecimal del token entregado
    usuario_id      UNIQUEIDENTIFIER NOT NULL,
    creada_en       DATETIME2(3)     NOT NULL CONSTRAINT DF_Sesiones_Creada DEFAULT SYSUTCDATETIME(),
    ultimo_acceso   DATETIME2(3)     NOT NULL CONSTRAINT DF_Sesiones_Acceso DEFAULT SYSUTCDATETIME(),
    expira_en       DATETIME2(3)     NOT NULL,   -- vencimiento absoluto
    ip              VARCHAR(45)      NULL,       -- 45: cabe una IPv6
    agente_usuario  NVARCHAR(255)    NULL,
    revocada_en     DATETIME2(3)     NULL,
    motivo_revocacion VARCHAR(30)    NULL,

    CONSTRAINT PK_Sesiones         PRIMARY KEY (token_hash),
    CONSTRAINT FK_Sesiones_Usuario FOREIGN KEY (usuario_id) REFERENCES dbo.Usuarios (usuario_id),
    CONSTRAINT CK_Sesiones_Motivo  CHECK (motivo_revocacion IS NULL OR motivo_revocacion IN
        ('CIERRE_SESION','EXPIRACION','REVOCACION_ADMIN','CAMBIO_CLAVE'))
);
GO

-- Sesiones activas de un usuario: lo que consulta el listado de dispositivos y
-- lo que recorre la revocacion masiva al cambiar la contrasena.
CREATE INDEX IX_Sesiones_Usuario
    ON dbo.Sesiones (usuario_id)
    WHERE revocada_en IS NULL;

-- Lo unico que escanea la tarea de limpieza.
CREATE INDEX IX_Sesiones_Expiradas ON dbo.Sesiones (expira_en);
GO

/* ---------------------------------------------------------------- Creditos */
CREATE TABLE dbo.Creditos (
    credito_id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Creditos_Id DEFAULT NEWSEQUENTIALID(),
    num_credito         VARCHAR(20)      NOT NULL,   -- 'CR-2026-000123'
    deudor_id           UNIQUEIDENTIFIER NOT NULL,
    tipo_credito        VARCHAR(20)      NOT NULL,
    valor_solicitado    DECIMAL(18,2)    NOT NULL,
    tasa_interes        DECIMAL(9,6)     NOT NULL,   -- 1.5 % mensual necesita decimales
    num_cuotas          INT              NOT NULL,
    forma_pago          VARCHAR(20)      NOT NULL,
    estado              VARCHAR(15)      NOT NULL CONSTRAINT DF_Creditos_Estado DEFAULT 'SOLICITADO',
    fecha_solicitud     DATETIME2(3)     NOT NULL CONSTRAINT DF_Creditos_Fecha  DEFAULT SYSUTCDATETIME(),
    fecha_actualizacion DATETIME2(3)     NOT NULL CONSTRAINT DF_Creditos_Act    DEFAULT SYSUTCDATETIME(),
    eliminado_en        DATETIME2(3)     NULL,       -- borrado logico; NO es un estado del credito
    row_version         ROWVERSION,                  -- concurrencia optimista -> 409 Conflict

    CONSTRAINT PK_Creditos        PRIMARY KEY (credito_id),
    CONSTRAINT UQ_Creditos_Numero UNIQUE (num_credito),
    CONSTRAINT FK_Creditos_Deudor FOREIGN KEY (deudor_id) REFERENCES dbo.Usuarios (usuario_id),

    CONSTRAINT CK_Creditos_Tipo   CHECK (tipo_credito IN
        ('LIBRE_INVERSION','LIBRANZA','HIPOTECARIO','VEHICULO','MICROCREDITO','COMERCIAL')),
    CONSTRAINT CK_Creditos_Forma  CHECK (forma_pago IN ('NOMINA','CAJA','DEBITO_AUTOMATICO')),
    CONSTRAINT CK_Creditos_Estado CHECK (estado IN
        ('SOLICITADO','EN_ESTUDIO','APROBADO','RECHAZADO','DESEMBOLSADO','CANCELADO')),

    -- Reglas de negocio de la seccion 6, en la BD: el ultimo candado, no el unico.
    CONSTRAINT CK_Creditos_Valor  CHECK (valor_solicitado > 0),
    CONSTRAINT CK_Creditos_Tasa   CHECK (tasa_interes >= 0),
    CONSTRAINT CK_Creditos_Cuotas CHECK (num_cuotas > 0)
    -- Regla que NO va aqui: "el tipo de credito debe corresponder al tipo_persona del deudor".
    -- Cruza dos tablas, asi que vive en el servicio (ver el diagrama de flujo, paso 2).
);
GO

CREATE INDEX IX_Creditos_Estado_Fecha
    ON dbo.Creditos (estado, fecha_solicitud DESC)
    WHERE eliminado_en IS NULL;          -- listado paginado + dashboard

CREATE INDEX IX_Creditos_Deudor
    ON dbo.Creditos (deudor_id)
    WHERE eliminado_en IS NULL;          -- creditos de un asociado

-- Anti-duplicados: mismo deudor, mismo tipo y mismo valor con una solicitud viva.
CREATE UNIQUE INDEX UX_Creditos_Duplicado
    ON dbo.Creditos (deudor_id, tipo_credito, valor_solicitado)
    WHERE estado IN ('SOLICITADO','EN_ESTUDIO') AND eliminado_en IS NULL;
GO

/* ------------------------------------------------------------------ Cuotas */
-- Plan de amortizacion persistido. Las filas se generan al pasar el credito a
-- APROBADO, con la salida del motor de amortizacion.
--
-- fecha_vencimiento es DATE y no DATETIME2: un vencimiento es un dia del
-- calendario, no un instante. Es la unica excepcion a la convencion de fechas.
--
-- El promedio de dias de pago NO se almacena: se deriva de esta tabla con
--   AVG(DATEDIFF(day, fecha_vencimiento, fecha_pago))
-- sobre las cuotas con fecha_pago no nula. Guardarlo como columna crearia un
-- numero que nadie puede recalcular ni auditar.
CREATE TABLE dbo.Cuotas (
    cuota_id          BIGINT        IDENTITY(1,1) NOT NULL,
    credito_id        UNIQUEIDENTIFIER NOT NULL,
    numero_cuota      INT           NOT NULL,
    fecha_vencimiento DATE          NOT NULL,
    valor_cuota       DECIMAL(18,2) NOT NULL,
    abono_capital     DECIMAL(18,2) NOT NULL,
    abono_interes     DECIMAL(18,2) NOT NULL,
    saldo_posterior   DECIMAL(18,2) NOT NULL,
    estado            VARCHAR(12)   NOT NULL CONSTRAINT DF_Cuotas_Estado DEFAULT 'PENDIENTE',
    fecha_pago        DATE          NULL,
    valor_pagado      DECIMAL(18,2) NULL,

    CONSTRAINT PK_Cuotas         PRIMARY KEY (cuota_id),
    CONSTRAINT FK_Cuotas_Credito FOREIGN KEY (credito_id) REFERENCES dbo.Creditos (credito_id),
    CONSTRAINT UQ_Cuotas_Numero  UNIQUE (credito_id, numero_cuota),
    CONSTRAINT CK_Cuotas_Estado  CHECK (estado IN ('PENDIENTE','PAGADA','ANULADA')),
    CONSTRAINT CK_Cuotas_Numero  CHECK (numero_cuota > 0),
    CONSTRAINT CK_Cuotas_Valor   CHECK (valor_cuota > 0),

    -- Una cuota PAGADA tiene fecha y valor de pago; cualquier otra no los tiene.
    -- Sin esto es posible una fila que dice PENDIENTE y trae fecha_pago, y el
    -- promedio de dias saldria de datos incoherentes.
    CONSTRAINT CK_Cuotas_Pago CHECK (
        (estado =  'PAGADA' AND fecha_pago IS NOT NULL AND valor_pagado IS NOT NULL)
     OR (estado <> 'PAGADA' AND fecha_pago IS     NULL AND valor_pagado IS     NULL))
);
GO

-- Cuotas vencidas sin pagar: lo que consulta el reporte de mora.
CREATE INDEX IX_Cuotas_Pendientes
    ON dbo.Cuotas (fecha_vencimiento)
    WHERE estado = 'PENDIENTE';
GO

/* -------------------------------------------------------- HistorialCredito */
-- Append-only. Sin UPDATE ni DELETE: por eso una sola fecha.
CREATE TABLE dbo.HistorialCredito (
    historial_id    BIGINT           IDENTITY(1,1) NOT NULL,
    credito_id      UNIQUEIDENTIFIER NOT NULL,
    estado_anterior VARCHAR(15)      NULL,          -- NULL = creacion del credito
    estado_nuevo    VARCHAR(15)      NOT NULL,
    usuario_id      UNIQUEIDENTIFIER NULL,
    usuario_nombre  NVARCHAR(100)    NOT NULL,      -- snapshot: sobrevive al borrado del usuario
    observacion     NVARCHAR(500)    NULL,
    fecha           DATETIME2(3)     NOT NULL CONSTRAINT DF_Hist_Fecha DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_HistorialCredito      PRIMARY KEY (historial_id),
    CONSTRAINT FK_Historial_Credito     FOREIGN KEY (credito_id) REFERENCES dbo.Creditos (credito_id),
    CONSTRAINT FK_Historial_Usuario     FOREIGN KEY (usuario_id) REFERENCES dbo.Usuarios (usuario_id),
    CONSTRAINT CK_Historial_EstadoAnt   CHECK (estado_anterior IS NULL OR estado_anterior IN
        ('SOLICITADO','EN_ESTUDIO','APROBADO','RECHAZADO','DESEMBOLSADO','CANCELADO')),
    CONSTRAINT CK_Historial_EstadoNue   CHECK (estado_nuevo IN
        ('SOLICITADO','EN_ESTUDIO','APROBADO','RECHAZADO','DESEMBOLSADO','CANCELADO'))
);
GO

CREATE INDEX IX_Historial_Credito ON dbo.HistorialCredito (credito_id, fecha DESC);
GO

/* ----------------------------------------------------------- Notificaciones */
-- Patron outbox: se inserta en la MISMA transaccion que el credito y un worker
-- lee PENDIENTE y reintenta con backoff sobre proximo_intento. Si el sistema
-- externo esta caido, el credito igual se crea.
CREATE TABLE dbo.Notificaciones (
    notificacion_id BIGINT           IDENTITY(1,1) NOT NULL,
    event_id        UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Notif_Event DEFAULT NEWID(), -- idempotencia del receptor
    credito_id      UNIQUEIDENTIFIER NOT NULL,
    evento          VARCHAR(30)      NOT NULL,
    payload         NVARCHAR(MAX)    NOT NULL,      -- JSON exacto enviado
    estado          VARCHAR(10)      NOT NULL CONSTRAINT DF_Notif_Estado DEFAULT 'PENDIENTE',
    intentos        INT              NOT NULL CONSTRAINT DF_Notif_Intentos DEFAULT 0,
    http_status     INT              NULL,
    ultimo_error    NVARCHAR(500)    NULL,
    proximo_intento DATETIME2(3)     NULL,
    enviado_en      DATETIME2(3)     NULL,
    creado_en       DATETIME2(3)     NOT NULL CONSTRAINT DF_Notif_Creado DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_Notificaciones     PRIMARY KEY (notificacion_id),
    CONSTRAINT UQ_Notif_Event        UNIQUE (event_id),
    CONSTRAINT FK_Notif_Credito      FOREIGN KEY (credito_id) REFERENCES dbo.Creditos (credito_id),
    CONSTRAINT CK_Notif_Evento       CHECK (evento IN ('credito.creado','credito.estado_cambiado')),
    CONSTRAINT CK_Notif_Estado       CHECK (estado IN ('PENDIENTE','ENVIADO','FALLIDO')),
    CONSTRAINT CK_Notif_Payload      CHECK (ISJSON(payload) = 1)
);
GO

CREATE INDEX IX_Notif_Pendientes
    ON dbo.Notificaciones (proximo_intento)
    WHERE estado = 'PENDIENTE';          -- lo unico que escanea el worker
GO
