-- ============================================================================
-- ESQUEMA GENERADO -- artefacto de solo lectura, no editar a mano.
--
-- Se genero ejecutando literalmente las consultas de los archivos de
-- api/src/migraciones/ (en orden cronologico) contra una base vacia, tal
-- como las aplicaria `npm run migration:run`. La fuente de verdad del
-- esquema son las entidades TypeORM en api/src/entidades/ y sus migraciones;
-- este archivo es solo una fotografia de lectura para quien quiera ver el
-- DDL sin instalar el proyecto.
--
-- Generado el: 2026-09-08
-- Migraciones incluidas, en orden de aplicacion:
--   1757000000000-ConfiguracionBase
--   1788880451171-EsquemaInicial
--   1788896467107-EventosWebhookRecibidos
-- ============================================================================

ALTER DATABASE [Creditos] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
GO

IF OBJECT_ID('dbo.Seq_NumCredito') IS NULL CREATE SEQUENCE dbo.Seq_NumCredito AS INT START WITH 1 INCREMENT BY 1;
GO

CREATE TABLE "Usuarios" ("usuario_id" uniqueidentifier NOT NULL CONSTRAINT "DF_f08d6e50b15809d69e6db2cdd4b" DEFAULT NEWSEQUENTIALID(), "identificacion" varchar(20) NOT NULL, "nombre_razon_social" nvarchar(150) NOT NULL, "tipo_persona" varchar(20) NOT NULL, "tipo_usuario" varchar(10) NOT NULL, "activo" bit NOT NULL CONSTRAINT "DF_11ce33460eb952457d6cbe3caca" DEFAULT 1, "creado_en" datetime2(3) NOT NULL CONSTRAINT "DF_9a37488096b0cabf71022a9e2c2" DEFAULT SYSUTCDATETIME(), "actualizado_en" datetime2(3) NOT NULL CONSTRAINT "DF_0ed466c762d798d97f01bb97cc5" DEFAULT SYSUTCDATETIME(), CONSTRAINT "UQ_Usuarios_Ident" UNIQUE ("identificacion"), CONSTRAINT "CK_Usuarios_Persona" CHECK (tipo_persona IN ('PERSONA_NATURAL','PERSONA_JURIDICA')), CONSTRAINT "CK_Usuarios_Rol" CHECK (tipo_usuario IN ('ADMIN','ANALISTA','ASOCIADO')), CONSTRAINT "PK_Usuarios" PRIMARY KEY ("usuario_id"));
GO

CREATE TABLE "Sesiones" ("token_hash" char(64) NOT NULL, "usuario_id" uniqueidentifier NOT NULL, "csrf_token" varchar(64) NOT NULL, "creada_en" datetime2(3) NOT NULL CONSTRAINT "DF_a681ecbe6f46ab64b8fbcd87236" DEFAULT SYSUTCDATETIME(), "ultimo_acceso" datetime2(3) NOT NULL CONSTRAINT "DF_30479c55ced1db0cc858b67bffc" DEFAULT SYSUTCDATETIME(), "expira_en" datetime2(3) NOT NULL, "ip" varchar(45), "agente_usuario" nvarchar(255), "revocada_en" datetime2(3), "motivo_revocacion" varchar(30), CONSTRAINT "CK_Sesiones_Motivo" CHECK (motivo_revocacion IS NULL OR motivo_revocacion IN ('CIERRE_SESION','EXPIRACION','REVOCACION_ADMIN','CAMBIO_CLAVE')), CONSTRAINT "PK_Sesiones" PRIMARY KEY ("token_hash"));
GO

CREATE INDEX "IX_Sesiones_Expiradas" ON "Sesiones" ("expira_en") ;
GO

CREATE INDEX "IX_Sesiones_Usuario" ON "Sesiones" ("usuario_id") WHERE revocada_en IS NULL;
GO

CREATE TABLE "Creditos" ("credito_id" uniqueidentifier NOT NULL CONSTRAINT "DF_f2f36d107ffa520904f6e77a65b" DEFAULT NEWSEQUENTIALID(), "num_credito" varchar(20) NOT NULL, "deudor_id" uniqueidentifier NOT NULL, "tipo_credito" varchar(20) NOT NULL, "valor_solicitado" decimal(18,2) NOT NULL, "tasa_interes" decimal(9,6) NOT NULL, "num_cuotas" int NOT NULL, "forma_pago" varchar(20) NOT NULL, "estado" varchar(15) NOT NULL CONSTRAINT "DF_fada4c2fa47e653c503f7910229" DEFAULT 'SOLICITADO', "fecha_solicitud" datetime2(3) NOT NULL CONSTRAINT "DF_9bfe3d184b8a5205dc44b7647ec" DEFAULT SYSUTCDATETIME(), "fecha_actualizacion" datetime2(3) NOT NULL CONSTRAINT "DF_6726cf83c384c53b4e04728c934" DEFAULT SYSUTCDATETIME(), "eliminado_en" datetime2(3), "row_version" rowversion NOT NULL, CONSTRAINT "UQ_Creditos_Numero" UNIQUE ("num_credito"), CONSTRAINT "CK_Creditos_Cuotas" CHECK (num_cuotas > 0), CONSTRAINT "CK_Creditos_Tasa" CHECK (tasa_interes >= 0), CONSTRAINT "CK_Creditos_Valor" CHECK (valor_solicitado > 0), CONSTRAINT "CK_Creditos_Estado" CHECK (estado IN ('SOLICITADO','EN_ESTUDIO','APROBADO','RECHAZADO','DESEMBOLSADO','CANCELADO')), CONSTRAINT "CK_Creditos_Forma" CHECK (forma_pago IN ('NOMINA','CAJA','DEBITO_AUTOMATICO')), CONSTRAINT "CK_Creditos_Tipo" CHECK (tipo_credito IN ('LIBRE_INVERSION','LIBRANZA','HIPOTECARIO','VEHICULO','MICROCREDITO','COMERCIAL')), CONSTRAINT "PK_Creditos" PRIMARY KEY ("credito_id"));
GO

CREATE UNIQUE INDEX "UX_Creditos_Duplicado" ON "Creditos" ("deudor_id", "tipo_credito", "valor_solicitado") WHERE estado IN ('SOLICITADO','EN_ESTUDIO') AND eliminado_en IS NULL;
GO

CREATE INDEX "IX_Creditos_Deudor" ON "Creditos" ("deudor_id") WHERE eliminado_en IS NULL;
GO

CREATE INDEX "IX_Creditos_Estado_Fecha" ON "Creditos" ("estado", "fecha_solicitud" DESC) WHERE eliminado_en IS NULL;
GO

CREATE TABLE "Notificaciones" ("notificacion_id" bigint NOT NULL IDENTITY(1,1), "event_id" uniqueidentifier NOT NULL CONSTRAINT "DF_307f155ab78f6a0a1814e21d6d0" DEFAULT NEWID(), "credito_id" uniqueidentifier NOT NULL, "evento" varchar(30) NOT NULL, "payload" nvarchar(MAX) NOT NULL, "estado" varchar(10) NOT NULL CONSTRAINT "DF_318b162d57b3b070b10cfe2e391" DEFAULT 'PENDIENTE', "intentos" int NOT NULL CONSTRAINT "DF_96bfed8c2686f510e76235b4f0e" DEFAULT 0, "http_status" int, "ultimo_error" nvarchar(500), "proximo_intento" datetime2(3), "enviado_en" datetime2(3), "creado_en" datetime2(3) NOT NULL CONSTRAINT "DF_6394d7154dea174908b0916840b" DEFAULT SYSUTCDATETIME(), CONSTRAINT "UQ_Notif_Event" UNIQUE ("event_id"), CONSTRAINT "CK_Notif_Payload" CHECK (ISJSON(payload) = 1), CONSTRAINT "CK_Notif_Estado" CHECK (estado IN ('PENDIENTE','ENVIANDO','ENVIADO','FALLIDO')), CONSTRAINT "CK_Notif_Evento" CHECK (evento IN ('credito.creado','credito.estado_cambiado')), CONSTRAINT "PK_Notificaciones" PRIMARY KEY ("notificacion_id"));
GO

CREATE INDEX "IX_Notif_Pendientes" ON "Notificaciones" ("proximo_intento") WHERE estado = 'PENDIENTE';
GO

CREATE TABLE "HistorialCredito" ("historial_id" bigint NOT NULL IDENTITY(1,1), "credito_id" uniqueidentifier NOT NULL, "estado_anterior" varchar(15), "estado_nuevo" varchar(15) NOT NULL, "usuario_id" uniqueidentifier, "usuario_nombre" nvarchar(100) NOT NULL, "observacion" nvarchar(500), "fecha" datetime2(3) NOT NULL CONSTRAINT "DF_d62ba58ae96b2664cff68cf202c" DEFAULT SYSUTCDATETIME(), CONSTRAINT "CK_Historial_EstadoNue" CHECK (estado_nuevo IN ('SOLICITADO','EN_ESTUDIO','APROBADO','RECHAZADO','DESEMBOLSADO','CANCELADO')), CONSTRAINT "CK_Historial_EstadoAnt" CHECK (estado_anterior IS NULL OR estado_anterior IN ('SOLICITADO','EN_ESTUDIO','APROBADO','RECHAZADO','DESEMBOLSADO','CANCELADO')), CONSTRAINT "PK_HistorialCredito" PRIMARY KEY ("historial_id"));
GO

CREATE INDEX "IX_Historial_Credito" ON "HistorialCredito" ("credito_id", "fecha" DESC) ;
GO

CREATE TABLE "Cuotas" ("cuota_id" bigint NOT NULL IDENTITY(1,1), "credito_id" uniqueidentifier NOT NULL, "numero_cuota" int NOT NULL, "fecha_vencimiento" date NOT NULL, "valor_cuota" decimal(18,2) NOT NULL, "abono_capital" decimal(18,2) NOT NULL, "abono_interes" decimal(18,2) NOT NULL, "saldo_posterior" decimal(18,2) NOT NULL, "estado" varchar(12) NOT NULL CONSTRAINT "DF_ffd3ef1ae5fad752063d23b4d56" DEFAULT 'PENDIENTE', "fecha_pago" date, "valor_pagado" decimal(18,2), CONSTRAINT "UQ_Cuotas_Numero" UNIQUE ("credito_id", "numero_cuota"), CONSTRAINT "CK_Cuotas_Pago" CHECK ((estado = 'PAGADA' AND fecha_pago IS NOT NULL AND valor_pagado IS NOT NULL)
   OR (estado <> 'PAGADA' AND fecha_pago IS NULL AND valor_pagado IS NULL)), CONSTRAINT "CK_Cuotas_Valor" CHECK (valor_cuota > 0), CONSTRAINT "CK_Cuotas_Numero" CHECK (numero_cuota > 0), CONSTRAINT "CK_Cuotas_Estado" CHECK (estado IN ('PENDIENTE','PAGADA','ANULADA')), CONSTRAINT "PK_Cuotas" PRIMARY KEY ("cuota_id"));
GO

CREATE INDEX "IX_Cuotas_Pendientes" ON "Cuotas" ("fecha_vencimiento") WHERE estado = 'PENDIENTE';
GO

CREATE TABLE "Credenciales" ("usuario_id" uniqueidentifier NOT NULL, "correo" varchar(254) NOT NULL, "password_hash" varchar(255) NOT NULL, "intentos_fallidos" int NOT NULL CONSTRAINT "DF_68fa519fc8bec2f5c1246b1f2dc" DEFAULT 0, "bloqueado_hasta" datetime2(3), "creado_en" datetime2(3) NOT NULL CONSTRAINT "DF_14c730e2f754b94db8afc17409e" DEFAULT SYSUTCDATETIME(), "actualizado_en" datetime2(3) NOT NULL CONSTRAINT "DF_467036b39f442b973238920dcca" DEFAULT SYSUTCDATETIME(), CONSTRAINT "UQ_Credenciales_Correo" UNIQUE ("correo"), CONSTRAINT "PK_Credenciales" PRIMARY KEY ("usuario_id"));
GO

ALTER TABLE "Sesiones" ADD CONSTRAINT "FK_Sesiones_Usuario" FOREIGN KEY ("usuario_id") REFERENCES "Usuarios"("usuario_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
GO

ALTER TABLE "Creditos" ADD CONSTRAINT "FK_Creditos_Deudor" FOREIGN KEY ("deudor_id") REFERENCES "Usuarios"("usuario_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
GO

ALTER TABLE "Notificaciones" ADD CONSTRAINT "FK_Notif_Credito" FOREIGN KEY ("credito_id") REFERENCES "Creditos"("credito_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
GO

ALTER TABLE "HistorialCredito" ADD CONSTRAINT "FK_Historial_Credito" FOREIGN KEY ("credito_id") REFERENCES "Creditos"("credito_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
GO

ALTER TABLE "HistorialCredito" ADD CONSTRAINT "FK_Historial_Usuario" FOREIGN KEY ("usuario_id") REFERENCES "Usuarios"("usuario_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
GO

ALTER TABLE "Cuotas" ADD CONSTRAINT "FK_Cuotas_Credito" FOREIGN KEY ("credito_id") REFERENCES "Creditos"("credito_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
GO

ALTER TABLE "Credenciales" ADD CONSTRAINT "FK_Credenciales_Usuario" FOREIGN KEY ("usuario_id") REFERENCES "Usuarios"("usuario_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
GO

CREATE TABLE "EventosWebhookRecibidos" ("event_id" uniqueidentifier NOT NULL, "recibido_en" datetime2(3) NOT NULL CONSTRAINT "DF_3a845bc42d0371b37fc532e4405" DEFAULT SYSUTCDATETIME(), CONSTRAINT "PK_EventosWebhookRecibidos" PRIMARY KEY ("event_id"));
GO

