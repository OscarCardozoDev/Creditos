# Modelo de Datos

Estructura de la información, cómo se define y cómo se aplican los cambios.

---

## 1. Entidades y relaciones

![Diagrama entidad - relación](../diagramas/Diagrama%20entidad%20-%20relacion.svg)

### Por qué cada tabla existe

| Tabla | Papel |
|---|---|
| `Usuarios` | Persona natural o jurídica. Es a la vez el deudor y, si tiene acceso, el operador del sistema |
| `Credenciales` | Relación uno a uno **opcional** con `Usuarios`: un asociado registrado como deudor no necesariamente tiene acceso a la aplicación. Su `usuario_id` es a la vez llave primaria y foránea, que es lo que fuerza la cardinalidad uno a uno. Separarla mantiene el hash fuera de la tabla que más se consulta |
| `Sesiones` | Sesiones activas y su rastro de auditoría |
| `Creditos` | La solicitud y su estado |
| `Cuotas` | Plan de amortización persistido y registro de pagos. Ver sección 1.1 |
| `HistorialCredito` | Bitácora append-only de transiciones |
| `Notificaciones` | Bandeja de salida de eventos hacia sistemas externos |

`tipo_usuario` y `tipo_persona` son ejes independientes: el primero dice qué puede hacer alguien
en la aplicación (`ADMIN`, `ANALISTA`, `ASOCIADO`), el segundo qué es el deudor frente a la ley
(`PERSONA_NATURAL`, `PERSONA_JURIDICA`). Un mismo usuario puede ser persona jurídica y tener rol
de asociado.

---

## 1.1 `Cuotas` y el promedio de días de pago

El sistema expone, por crédito, **cuántos días tarda en promedio el deudor en pagar la cuota
del mes**. Ese número no se almacena: se deriva.

### Por qué no es una columna de `Creditos`

Un promedio es un resultado, no un hecho. Para producirlo hacen falta los hechos de los que
sale: cuándo venció cada cuota y cuándo se pagó realmente. Sin esas dos fechas, una columna
`dias_promedio_pago` sería un número que nadie puede recalcular, contrastar ni auditar — y la
pregunta "¿por qué este crédito dice 3,4 días?" se quedaría sin respuesta posible. En un
sistema financiero, esa es la propiedad que no se puede perder.

### Cuándo se generan las filas

Al pasar el crédito de `APROBADO`, en la **misma transacción** de esa transición. El motor de
amortización (`modulos/03_simulacion.md`) ya produce la tabla completa: cuota, abono a capital,
abono a interés y saldo posterior por periodo. Persistirla es escribir esas N filas.

`estado` admite `PENDIENTE`, `PAGADA` y `ANULADA`. La tercera cubre el caso real de un crédito
que se cancela después de aprobado: las cuotas se anulan, no se borran, coherente con que en
este sistema nada se elimina físicamente.

### La restricción que sostiene el cálculo

```sql
CONSTRAINT CK_Cuotas_Pago CHECK (
    (estado =  'PAGADA' AND fecha_pago IS NOT NULL AND valor_pagado IS NOT NULL)
 OR (estado <> 'PAGADA' AND fecha_pago IS     NULL AND valor_pagado IS     NULL))
```

Sin ella es posible una fila que se declara `PENDIENTE` y trae `fecha_pago`, y el promedio
saldría de datos incoherentes. La restricción hace que ese estado no exista.

### El cálculo

```sql
SELECT AVG(CAST(DATEDIFF(day, fecha_vencimiento, fecha_pago) AS DECIMAL(9,2)))
FROM dbo.Cuotas
WHERE credito_id = @id AND fecha_pago IS NOT NULL;
```

Un valor **negativo** significa que el deudor paga antes del vencimiento, que es información
tan útil como el retraso. `NULL` cuando todavía no hay ninguna cuota pagada — el campo se
devuelve nulo, no cero: no es lo mismo "paga puntual" que "aún no ha pagado nada".

Se calcula al vuelo y no se denormaliza. A este volumen la consulta es un *seek* por
`credito_id` sobre un puñado de filas. Si el listado llegara a resentirlo, el paso siguiente es
una columna mantenida en la transacción del pago o un modelo de lectura, pero eso se hace con
una medición que lo justifique, no por anticipado.

### Lo que viene de regalo

Persistir el plan de amortización habilita, sin trabajo adicional: saldo pendiente real,
próxima cuota a vencer, cuotas en mora y días de atraso — todas consultas sobre la misma tabla.

---

## 2. Decisiones sobre tipos y restricciones

| Decisión | Motivo |
|---|---|
| Montos en `DECIMAL(18,2)`, nunca `FLOAT` | El punto flotante binario no representa exactamente valores decimales. Sumar mil cuotas en `FLOAT` produce descuadres que ningún contador acepta |
| Tasas en `DECIMAL(9,6)` | Una tasa mensual del 1,388843 % necesita seis decimales; redondear a dos cambia el valor de la cuota |
| Fechas en `DATETIME2(3)` y en UTC | `DATE` pierde la hora; `DATETIME` tiene precisión de 3,33 ms y rango limitado. UTC evita ambigüedad en cambios de horario |
| `Cuotas.fecha_vencimiento` y `Cuotas.fecha_pago` en `DATE` | Única excepción a la regla anterior: un vencimiento es un día del calendario, no un instante. Guardar hora invitaría a comparaciones con husos horarios en un dato que no la tiene |
| Identificadores de negocio en `UNIQUEIDENTIFIER` | Se generan sin ida y vuelta a la base y no filtran volumen de operación, como sí lo hace un consecutivo expuesto |
| `NEWSEQUENTIALID()` como valor por defecto | Un GUID aleatorio como clave agrupada fragmenta el índice en cada inserción. El secuencial escribe siempre al final |
| `identificacion` en `VARCHAR` y no numérico | Admite ceros a la izquierda y dígitos de verificación |
| Bitácoras con `BIGINT IDENTITY` | Son tablas de inserción intensiva que no se exponen por la API; un entero secuencial es más compacto y más rápido de indexar |
| Enumeraciones como `CHECK` | SQL Server no tiene tipo enumerado nativo |
| `eliminado_en` separado del estado | El borrado lógico es un hecho administrativo, no un estado del crédito |
| `ROWVERSION` | Concurrencia optimista sin bloqueos: el motor lo incrementa en cada escritura |

### Índices

| Índice | Para qué |
|---|---|
| `IX_Creditos_Estado_Fecha` sobre `(estado, fecha_solicitud DESC)`, filtrado por `eliminado_en IS NULL` | Listado paginado y conteos del tablero |
| `IX_Creditos_Deudor`, filtrado igual | Créditos de un asociado |
| `UX_Creditos_Duplicado`, único y filtrado por estados vivos | Impide solicitudes duplicadas bajo concurrencia |
| `UQ_Cuotas_Numero` sobre `(credito_id, numero_cuota)` | Impide dos cuotas con el mismo número; sirve además para leer el plan en orden |
| `IX_Cuotas_Pendientes` sobre `fecha_vencimiento`, filtrado por `estado = 'PENDIENTE'` | Cuotas vencidas sin pagar: el reporte de mora |
| `IX_Historial_Credito` sobre `(credito_id, fecha DESC)` | Bitácora de un crédito |
| `IX_Notif_Pendientes` sobre `proximo_intento`, filtrado por `estado = 'PENDIENTE'` | Único recorrido que hace el proceso de entrega |

Los índices filtrados son la pieza clave: solo indexan las filas que las consultas realmente
tocan. El índice de pendientes ignora los millones de notificaciones ya enviadas, y los de
créditos ignoran los borrados.

`UX_Creditos_Duplicado` merece atención aparte: al ser único **y** filtrado por
`estado IN ('SOLICITADO','EN_ESTUDIO')`, impide dos solicitudes vivas equivalentes pero permite
que el mismo asociado vuelva a pedir el mismo producto por el mismo monto una vez la anterior
terminó su ciclo.

### Instantáneas de lectura

La base opera con `READ_COMMITTED_SNAPSHOT` activado. Los lectores no bloquean a los escritores:
el tablero puede agregar sobre la misma tabla donde se están insertando créditos sin que ninguno
espere al otro. El costo es mayor uso de `tempdb`, que a este volumen es irrelevante.

### `useUTC` explícito en la conexión

`api/src/config/data-source.ts` declara `options.useUTC: true`. Sin esa línea, el driver de
`mssql` que usa TypeORM cae en `useUTC: false` por defecto y convierte cada `datetime2` a la hora
local del proceso que corre la API, no a UTC. Dentro de un contenedor con el reloj del sistema en
UTC el desfase es cero y el defecto pasa desapercibido. Se hace evidente al correr la API fuera
de Docker (`npm run start:dev`, flujo que `operacion/01_entorno_local.md` documenta como válido)
en una máquina con otro huso horario: `expira_en` se leía corrido varias
horas y una sesión ya vencida seguía pareciendo vigente. `useUTC: true` hace explícito lo que la
invariante 10 ya exige — fechas en UTC — en vez de depender de que el contenedor siempre esté en
esa zona horaria.

---

## 3. El esquema se define en el código

La estructura de la base vive en las **entidades TypeORM**, no en un archivo `.sql` mantenido
aparte. El ORM existe justamente para que el esquema esté a la vista dentro del código; si el
esquema real se definiera fuera y las entidades solo lo "reflejaran", habría dos definiciones de
lo mismo desincronizándose en silencio.

La dirección es siempre la misma:

### Flujo de trabajo

```bash
# 1. Se edita la entidad
# 2. TypeORM compara las entidades contra la base real y escribe la diferencia
npm run migration:generate -- src/migraciones/AgregarEstadoEnviando
# 3. Se revisa el SQL generado
# 4. Se aplica
npm run migration:run
```

La base de datos no se modifica manualmente en ningún entorno, tampoco en desarrollo.

### Por qué `synchronize: false`

La sincronización automática también propaga los cambios del código a la base, y es la opción
inmediata. Se descarta:

- **Destruye datos.** Renombrar una propiedad no se traduce en un `RENAME`: el ORM ve una columna
  que sobra y otra que falta, y ejecuta `DROP` seguido de `ADD`. La columna anterior se va con
  todo su contenido.
- **No deja historia.** No hay registro de cuándo cambió el esquema ni forma de volver atrás.
- **No admite reversión.** Una migración tiene operación de subida y de bajada.
- **No es utilizable en producción**, lo que obligaría a mantener dos mecanismos distintos: uno
  para desarrollar y otro para desplegar. Probar con uno y desplegar con el otro traslada los
  problemas al día del despliegue.

La generación de migraciones ofrece el mismo beneficio —la diferencia calculada
automáticamente— pero deja un archivo versionado, revisable y reversible.

### Qué revisar en la migración generada

La generación acierta casi siempre, pero no infiere intenciones:

| Situación | Lo que genera | Corrección |
|---|---|---|
| Renombrar una columna | `DROP` + `ADD`, con pérdida de datos | `sp_rename`, o `ADD` + `UPDATE` + `DROP` |
| Cambiar el tipo de una columna con datos | Un `ALTER COLUMN` que puede fallar | Migración en varios pasos |
| Agregar columna obligatoria a una tabla con filas | Un `ALTER` que falla | Agregar con valor por defecto, poblar y luego endurecer |

La migración generada se lee siempre antes de aplicarse.

---

## 4. Lo que se expresa con decoradores

Casi todo el esquema, incluidas las construcciones específicas de SQL Server:

| Elemento | Decorador |
|---|---|
| Restricciones `CHECK`, incluida `ISJSON(payload) = 1` | `@Check('CK_Creditos_Estado', "estado IN ('SOLICITADO', ...)")` |
| Índice filtrado | `@Index('IX_...', ['estado', 'fechaSolicitud'], { where: 'eliminado_en IS NULL' })` |
| Índice único filtrado | `@Index('UX_...', [...], { unique: true, where: "..." })` |
| `DEFAULT NEWSEQUENTIALID()` | `@PrimaryColumn({ type: 'uniqueidentifier', default: () => 'NEWSEQUENTIALID()' })` |
| `DEFAULT SYSUTCDATETIME()` | `@Column({ type: 'datetime2', precision: 3, default: () => 'SYSUTCDATETIME()' })` |
| `DECIMAL(18,2)` | `@Column({ type: 'decimal', precision: 18, scale: 2 })` |
| `ROWVERSION` | `@Column({ type: 'rowversion', readonly: true })` |
| Llaves foráneas | `@ManyToOne` con `@JoinColumn` |

Conviene verificar en la primera migración, sobre una base vacía, que el SQL generado coincide
con lo esperado —particularmente los `CHECK` y los índices filtrados— antes de construir sobre
esa base.

### Lo que no cabe en un decorador

Dos elementos, ambos en una migración escrita a mano, que sigue siendo código versionado y se
aplica con el mismo comando:

```typescript
await queryRunner.query(
  `ALTER DATABASE Creditos SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE`
);
await queryRunner.query(
  `CREATE SEQUENCE dbo.Seq_NumCredito AS INT START WITH 1 INCREMENT BY 1`
);
```

`READ_COMMITTED_SNAPSHOT` es configuración de la base, no de una tabla, y ninguna entidad puede
representarla. La secuencia es un objeto que el ORM no modela.

El principio se mantiene: el esquema completo está en `api/src/entidades/` y
`api/src/migraciones/`, y se aplica con un solo comando.

---

## 5. Numeración de créditos

El número tiene formato `CR-{año}-{consecutivo de 6 dígitos}` y el consecutivo sale de
`NEXT VALUE FOR dbo.Seq_NumCredito`, solicitado dentro de la transacción de creación.

Calcularlo con `SELECT MAX(...) + 1` produce números repetidos en cuanto hay concurrencia, y la
restricción de unicidad convierte eso en errores intermitentes difíciles de reproducir.

Se consideró una columna `INT IDENTITY` aparte, que el ORM sí modela. Se descartó porque el
número lleva el año embebido y una columna de identidad no se reinicia por año sin
`DBCC CHECKIDENT`, que es precisamente el tipo de intervención manual sobre la base que este
diseño evita.

---

## 6. Concurrencia optimista

`Creditos.row_version` es una columna `ROWVERSION`: el motor la incrementa en cada escritura y
nadie más puede asignarla.

No se usa el mecanismo de versión del ORM, porque ese incrementa el valor por su cuenta y aquí lo
incrementa la base. El control se hace explícito en la escritura:

```sql
UPDATE dbo.Creditos
SET ...
WHERE credito_id = @id AND row_version = @rowVersion;
```

Si no se afecta ninguna fila, otro proceso modificó el crédito entre la lectura y la escritura, y
la API responde `409 CONCURRENCIA_CONFLICTO`. La detección ocurre en la misma operación de
escritura, sin bloqueos ni lecturas previas.

---

## 7. El archivo SQL

`base_de_datos/esquema_referencia.sql` documenta el diseño con sus justificaciones y sirve de
referencia de lectura. **No es la fuente de verdad**: el esquema efectivo lo definen las
entidades.

El script equivalente al esquema vigente se obtiene volcándolo desde las migraciones aplicadas
sobre una base vacía, y se publica como `db/esquema_generado.sql` con un encabezado que advierte
que es generado.

---

## 8. Aplicación del esquema por entorno

| Entorno | Cómo |
|---|---|
| Desarrollo | `migration:run` al levantar el entorno |
| Pruebas | Contenedor efímero más `migration:run` antes de la suite. Cada ejecución valida también las migraciones |
| Producción | Paso explícito del despliegue, antes de arrancar la nueva versión, con respaldo previo |

Que las migraciones se apliquen también al ejecutar pruebas hace que una migración rota falle en
integración continua y no durante un despliegue.
