# Escalabilidad

Qué límites tiene el diseño actual, en qué orden aparecen y qué se hace en cada caso.

Escenario de referencia: pasar de **500 créditos mensuales a 500.000**, atendiendo además a
varias entidades cooperativas sobre la misma plataforma.

---

## 1. Dimensionar antes de decidir

Medio millón de operaciones al mes suena a un problema de escritura. No lo es:

```
500.000 créditos / mes
÷ 30 días              ≈ 16.700 por día
÷ 8 horas hábiles      ≈  2.100 por hora
÷ 3.600 segundos       ≈    0,6 escrituras por segundo en promedio
× 10 (factor de pico)  ≈      6 escrituras por segundo en el pico
```

**Seis escrituras por segundo.** Una instancia de SQL Server correctamente indexada las atiende
sin dificultad. El diseño actual no se rompe por el volumen de escritura.

Lo que sí cambia de escala es el **acumulado**:

| Tabla | Filas por mes | Filas por año |
|---|---|---|
| `Creditos` | 500.000 | 6.000.000 |
| `HistorialCredito` | ~2.000.000 | ~24.000.000 |
| `Notificaciones` | ~2.000.000 | ~24.000.000 |
| `Sesiones` | según usuarios activos | acotado por la limpieza periódica |

Y aparecen dos presiones nuevas: **lectura** —el tablero agrega sobre millones de filas— y
**aislamiento entre entidades**.

---

## 2. Orden de intervención

### 1. Identificador de entidad en todas las tablas

Es el cambio más barato de hacer temprano y el más costoso de hacer tarde.

- `entidad_id` como **primera columna de cada índice**, incluido el anti-duplicado, que pasa a
  ser `(entidad_id, deudor_id, tipo_credito, valor_solicitado)`. Sin ese cambio, dos cooperativas
  distintas no podrían registrar al mismo asociado.
- El filtro se aplica en el repositorio, no en cada consulta escrita a mano. Un `WHERE entidad_id`
  olvidado no es un error de rendimiento: es una fuga de datos entre clientes.
- Aislamiento por esquema o por base separada solo para entidades que lo exijan por contrato. Una
  base única con `entidad_id` es más simple de operar y suficiente en la mayoría de los casos.

### 2. Tablero desde un modelo de lectura

Dejar de contar en vivo. Una tabla `ResumenDiario(entidad_id, fecha, estado, cantidad, monto)`
que se actualiza al escribir, o una vista indexada. La consulta pasa de recorrer millones de
filas a leer decenas.

### 3. Partición por fecha

`Creditos`, `HistorialCredito` y `Notificaciones` particionadas por mes. Las consultas
habituales filtran por fecha reciente y el motor descarta particiones enteras sin leerlas.
Archivar deja de ser un `DELETE` de millones de filas y pasa a ser un cambio de partición.

### 4. Réplica de lectura

Listados, tablero y reportes contra la réplica; solo las escrituras contra la primaria.

Con una salvedad: la replicación tiene retardo de segundos. Es aceptable para un listado, **no**
para leer un crédito recién creado. Ese caso se resuelve leyendo de la primaria, o simplemente
usando el objeto que devolvió la escritura.

### 5. Separar el proceso de entrega

Despliegue propio y escala independiente, para que una tormenta de reintentos no consuma CPU del
camino que atiende a los usuarios.

### 6. Sesiones a un almacén en memoria

Este es el punto en que la decisión de guardar sesiones en SQL Server se revisa. Cada petición
autenticada hace una consulta al almacén; a suficiente volumen, esa consulta compite con la carga
transaccional.

El disparador es medible: cuando la consulta de resolución de sesión aparezca entre las más
frecuentes o más costosas del motor. La migración a Redis es directa, porque el módulo de
sesiones expone una interfaz propia y el cambio no toca el resto del sistema. Se paga con la
pérdida de durabilidad —un reinicio sin persistencia expulsa a todos— y del rastro de auditoría,
que en ese momento habría que conservar aparte.

### 7. Cache de catálogos

Para lo que se lee mucho y cambia poco: tipos de crédito, tasas de política, resumen del tablero
con vigencia corta. **No** para créditos individuales: invalidarlos correctamente cuesta más de
lo que ahorra.

### 8. Archivado

`HistorialCredito` y `Notificaciones` con más de N meses pasan a almacenamiento frío. Las
notificaciones ya entregadas con más de 90 días pueden purgarse: su valor probatorio es corto, a
diferencia del historial, que se conserva por retención.

### 9. Autoescalado de la API

Es lo que habilita el diseño sin estado en el proceso, y por eso esa propiedad se cuidó desde el
principio.

---

## 3. Límites conocidos del diseño actual

| Límite | Cuándo aparece | Qué se hace |
|---|---|---|
| Paginación con `OFFSET/FETCH` | Páginas profundas sobre millones de filas: el motor recorre y descarta las anteriores | Paginación por cursor sobre `(fecha_solicitud, credito_id)` |
| Conteos en vivo del tablero | Cuando `Creditos` supera algunos millones de filas | Modelo de lectura (punto 2) |
| La tabla como cola de notificaciones | Cuando el barrido periódico pesa o la profundidad crece de forma sostenida | Intermediario de mensajería |
| Consulta de sesión por petición | Alto volumen de peticiones autenticadas | Almacén en memoria (punto 6) |
| Proceso de entrega dentro de la API | Cuando los reintentos compiten con el tráfico de usuarios | Despliegue separado (punto 5) |

Todos están identificados y ninguno exige rediseño: son sustituciones localizadas.

---

## 4. Lo que no se cambia

Es tan relevante como la lista anterior.

**Microservicios.** El dominio es uno y sus transacciones cruzan crédito, historial y bandeja de
salida. Separarlo obligaría a transacciones distribuidas o a compensaciones para resolver un
problema que no existe. A seis escrituras por segundo, un monolito bien modularizado es la
respuesta correcta.

**Base no relacional.** Los datos son relacionales, transaccionales y con restricciones de
integridad estrictas. Es el caso de uso para el que se diseñaron las bases relacionales.

**Fragmentación horizontal de la base.** Antes hay que agotar réplicas de lectura, particiones y
escala vertical. Fragmentar multiplica la complejidad operativa y solo se justifica cuando la
escritura ya no cabe en un nodo, que está dos órdenes de magnitud por encima de este escenario.

---

## 5. Decisiones y compensaciones

| Decisión | Se gana | Se paga |
|---|---|---|
| Dimensionar antes de rediseñar | Se evita construir para una carga que no existe | Exige medir en lugar de aplicar recetas |
| `entidad_id` desde el inicio | El multi-entidad no obliga a reescribir índices ni consultas | Una columna y un filtro más en todo, antes de necesitarlos |
| Modelo de lectura para el tablero | Consultas constantes frente al volumen | Datos con retardo y un proceso de actualización que mantener |
| Réplica de lectura | Descarga la primaria | Lecturas desfasadas; hay que decidir cuáles no lo toleran |
| Sesiones en la base hasta que se midan | Un componente menos, con durabilidad y auditoría | Una consulta por petición; migración pendiente cuando el volumen lo exija |
| Sin microservicios | Transacciones locales y despliegue simple | Toda la aplicación escala junta |
