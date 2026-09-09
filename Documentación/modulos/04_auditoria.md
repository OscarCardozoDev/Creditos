# Módulo de Auditoría e Historial

Registra quién cambió qué, cuándo y por qué. En un sistema que mueve dinero, la bitácora no es
una función auxiliar: es el registro probatorio de las decisiones tomadas.

---

## 1. Qué hace

- `HistorialCredito` recibe una fila por cada cambio de estado de un crédito, incluida su
  creación.
- La escritura ocurre siempre dentro de la transacción del cambio que la origina. No hay forma
  de que exista un cambio sin su registro, ni un registro sin su cambio.
- `GET /api/creditos/:id/historial` devuelve la bitácora ordenada de más reciente a más antigua,
  apoyada en `IX_Historial_Credito`.

El servicio expone un solo método de escritura, `registrar(...)`. No existe método de
actualización ni de borrado, y esa ausencia es deliberada.

---

## 2. Solo se agrega, nunca se modifica

La tabla únicamente recibe `INSERT`. Por eso tiene una sola columna de fecha y no el par
`creado_en` / `actualizado_en`: una fila que jamás cambia no necesita fecha de modificación.

Una bitácora que se puede editar deja de ser una bitácora y pasa a ser una narración. Su valor
depende de que nadie —incluido quien administra la aplicación— pueda reescribirla después del
hecho.

La restricción se sostiene en tres niveles:

1. **El repositorio de historial expone únicamente `registrar`.** No hay método de actualización
   ni de borrado que alguien pueda llamar por descuido.
2. **El usuario de base de datos de la aplicación recibe `GRANT SELECT, INSERT`** sobre esa
   tabla, y no `UPDATE` ni `DELETE`.
3. **Propuesto:** un disparador `INSTEAD OF UPDATE, DELETE` que lance error, o el uso de tablas
   temporales de sistema.

El permiso a nivel de base de datos es el que realmente cierra la puerta. La convención del
código protege del error honesto; el `GRANT` restringido protege también del código que todavía
no se ha escrito y de cualquier proceso que llegue por fuera de la aplicación.

---

## 3. Qué guarda cada fila

Responde a cinco preguntas: qué crédito, de qué estado a cuál, quién, cuándo y por qué.

| Columna | Contenido |
|---|---|
| `credito_id` | Crédito afectado |
| `estado_anterior` | Nulo únicamente en la creación |
| `estado_nuevo` | Estado resultante |
| `usuario_id` | Quien ejecutó la acción; nulo si fue un proceso del sistema |
| `usuario_nombre` | Copia del nombre en el momento del hecho |
| `observacion` | Motivo; obligatorio al rechazar o cancelar |
| `fecha` | UTC, con precisión de milisegundos |

### El nombre del usuario está duplicado a propósito

`usuario_nombre` repite un dato que ya está en `Usuarios`. Es la única duplicación intencional
del modelo.

Si la bitácora guardara solo `usuario_id`, al cambiar el nombre de una analista —o al retirar su
usuario— toda la auditoría pasada mostraría el nombre nuevo. El registro histórico se
reescribiría solo, sin que nadie tocara la tabla y sin dejar rastro de que cambió.

Un asiento de auditoría es una fotografía del momento, no una consulta en vivo. Por eso
`usuario_id` admite nulos —la persona puede desaparecer del sistema— mientras que
`usuario_nombre` es obligatorio: el nombre que constaba entonces no desaparece nunca.

Es el mismo principio por el que una factura guarda el precio al que se vendió y no un enlace al
catálogo actual.

---

## 4. Hechos y datos vigentes

El modelo separa dos clases de información, y la regla de mutabilidad se deriva de esa
distinción.

| Dato | Modificable | Condición |
|---|---|---|
| `credito_id`, `num_credito` | No | Identidad del acuerdo |
| `deudor_id` | No | Cambiarlo produce otro crédito, no una corrección |
| `fecha_solicitud` | No | Hecho ocurrido en un instante |
| Filas de `HistorialCredito` | No | Registro probatorio |
| Condiciones financieras | Sí, acotado | Solo en `SOLICITADO` o `EN_ESTUDIO` |
| `estado` | Sí, acotado | Solo por transición válida, con fila de historial |
| `eliminado_en` | Sí, acotado | Solo por borrado lógico; nunca vuelve a nulo |
| Nombre y correo del usuario | Sí | Son datos vigentes, no hechos |

> Los hechos son inmutables; los datos vigentes son modificables. Que un crédito se aprobó por
> 15 millones al 1,5 % es un hecho. El nombre actual del asociado es un dato vigente.

### Corregir un crédito ya aprobado

De la regla anterior se sigue que un crédito aprobado no se edita. Si el negocio necesita otras
condiciones, hay dos caminos válidos:

1. **Anular y reemitir.** Se cancela el crédito y se crea uno nuevo que lo referencia.
2. **Registrar un otrosí** como entidad aparte, que modifica las condiciones sin borrar las
   originales.

Ambos preservan la trazabilidad de lo que se pactó primero. Es el mismo razonamiento contable de
la nota crédito: la factura equivocada no se borra, se emite un documento que la corrige.

---

## 5. Alcance actual y extensiones previstas

Lo que la bitácora **cubre hoy**: transiciones de estado, con autor, momento y motivo.

Lo que **no cubre**, y cómo se resolvería:

| Vacío | Solución |
|---|---|
| Ediciones de campos que no cambian el estado (un `PATCH` de tasa o cuotas) | Tabla `AuditoriaCampos(credito_id, campo, valor_anterior, valor_nuevo, usuario, fecha)`. Es la extensión más inmediata |
| Quién *consultó* qué | Auditoría de accesos, separada de la de cambios. Relevante por tratarse de datos personales |
| Historial completo de cada fila | Tablas temporales de sistema de SQL Server (`SYSTEM_VERSIONED`), que el motor mantiene solo y se consultan con `FOR SYSTEM_TIME AS OF` |
| Crecimiento indefinido | Partición por fecha y archivado en frío, descrito en `arquitectura/06_escalabilidad.md` |

Sobre las tablas temporales: son la opción más sólida y quitan trabajo al código, pero generan
una tabla histórica por cada tabla versionada y desplazan la lógica de auditoría al motor, donde
es menos visible para quien lee el código. El diseño explícito se prefiere mientras el alcance
sea acotado.

---

## 6. Decisiones y compensaciones

| Decisión | Se gana | Se paga |
|---|---|---|
| Bitácora append-only | El registro no se puede reescribir | No hay forma de corregir un asiento equivocado, solo de agregar otro que lo aclare |
| `GRANT` sin `UPDATE` ni `DELETE` | La restricción no depende de la disciplina del código | Cualquier mantenimiento sobre esa tabla exige un usuario distinto y deja rastro |
| Copia del nombre del usuario | La auditoría no se reescribe al cambiar datos vigentes | Un dato duplicado, que a diferencia del resto no se sincroniza — y no debe hacerlo |
| Historial solo de estados | Simple y suficiente para el ciclo de vida | Las ediciones de campos no quedan registradas todavía |
| Escritura dentro de la transacción | Imposible que un cambio quede sin registro | Cada cambio de estado escribe en dos tablas |
