# Módulo de Autenticación y Sesiones

Controla quién entra al sistema y qué puede hacer una vez dentro. Es el único módulo que
sostiene estado del lado del servidor, y esa decisión condiciona el resto de la arquitectura.

---

## 1. Cómo funciona la autenticación

El sistema usa **sesiones del lado del servidor identificadas por un `session_id` opaco**,
transportado en una cookie. No usa tokens autocontenidos.

Lo que viaja al navegador es un **identificador sin significado**: 32 bytes aleatorios en
base64url. No contiene el usuario, ni el rol, ni la fecha de expiración. Toda esa información
vive en el servidor y se resuelve en cada petición.

---

## 2. Por qué sesiones y no un token autocontenido

Un token autocontenido (tipo JWT) lleva los datos del usuario firmados dentro y se valida sin
consultar nada. Es más barato de verificar y permite una API sin estado. Para una entidad
financiera, esa ventaja no compensa lo que se pierde:

| Aspecto | Sesión en servidor | Token autocontenido |
|---|---|---|
| **Revocación** | Inmediata. Se marca la fila y la siguiente petición ya falla | Imposible antes de que expire. Un token robado sirve hasta el final de su vigencia |
| **Cierre de sesión real** | El servidor destruye la sesión | El servidor "pide" al cliente que olvide el token. Si el atacante lo tiene, sigue entrando |
| **Cambio de rol o bloqueo de usuario** | Efecto inmediato | El token viejo sigue diciendo el rol viejo |
| **Ver y cerrar sesiones activas** | Consulta directa a la tabla | No hay lista de sesiones que consultar |
| **Datos expuestos** | Ninguno: el identificador no significa nada | El payload va firmado pero **no cifrado**: quien intercepte el token lee su contenido |
| **Tamaño en cada petición** | ~43 bytes | 400–1000 bytes |
| **Rastro de auditoría** | Cada sesión deja IP, agente, fechas | No queda registro salvo que se construya aparte |

En un sistema donde se aprueban desembolsos de dinero, "despedimos a la analista pero su sesión
sigue viva 15 minutos" no es una compensación aceptable. La revocación inmediata es el requisito
que decide.

**Lo que cuesta la decisión, dicho sin adornos:**

1. **La API deja de ser sin estado en sentido estricto.** Cada petición consulta el almacén de
   sesiones. La mitigación es que ese estado vive en un almacén compartido y no en la memoria
   del proceso, así que las réplicas siguen siendo intercambiables y desechables (ver
   `arquitectura/06_escalabilidad.md`).
2. **Aparece el CSRF.** Un token en cabecera `Authorization` es inmune por construcción: el
   navegador no lo adjunta solo. Una cookie sí se adjunta sola, y por eso hay que defenderse
   explícitamente (sección 6).
3. **Una consulta más por petición.** Se resuelve con índice y, si hiciera falta, con cache
   (sección 7).

---

## 3. El almacén de sesiones

Una tabla en SQL Server, no un almacén en memoria del proceso.

```typescript
@Entity('Sesiones')
export class Sesion {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  tokenHash: string;              // SHA-256 en hexadecimal del token entregado al cliente

  @Column({ type: 'uniqueidentifier' })
  usuarioId: string;

  @Column({ type: 'datetime2', precision: 3, default: () => 'SYSUTCDATETIME()' })
  creadaEn: Date;

  @Column({ type: 'datetime2', precision: 3, default: () => 'SYSUTCDATETIME()' })
  ultimoAcceso: Date;             // sostiene el vencimiento por inactividad

  @Column({ type: 'datetime2', precision: 3 })
  expiraEn: Date;                 // vencimiento absoluto, no se prorroga

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  agenteUsuario: string | null;

  @Column({ type: 'datetime2', precision: 3, nullable: true })
  revocadaEn: Date | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  motivoRevocacion: string | null; // CIERRE_SESION | EXPIRACION | REVOCACION_ADMIN | CAMBIO_CLAVE
}
```

### El token se guarda hasheado

La tabla guarda el **SHA-256 del token**, nunca el token. El razonamiento es el mismo que con
las contraseñas: si alguien obtiene una copia de la tabla —un respaldo mal custodiado, una
inyección SQL de solo lectura, un volcado de diagnóstico— con los tokens en claro se lleva
todas las sesiones activas y entra como cualquiera de esos usuarios. Con los hashes, no se
lleva nada utilizable.

Aquí basta SHA-256 sin factor de trabajo, a diferencia de las contraseñas: el token tiene 256
bits de entropía real y no es susceptible a fuerza bruta ni a diccionario. Poner argon2 sobre
él costaría cientos de milisegundos en **cada petición** sin ganar seguridad.

### Por qué en SQL Server y no en Redis

Redis es la opción habitual y es más rápida. Se elige la tabla porque:

- **Es un componente menos que operar, respaldar y monitorear.** SQL Server ya está ahí.
- **Las sesiones son auditables.** Quién entró, desde qué IP, cuándo y hasta cuándo queda
  registrado y sobrevive a un reinicio. En Redis, con TTL, esa historia se evapora.
- **Durabilidad.** Un reinicio de Redis sin persistencia expulsa a todos los usuarios
  conectados.

El costo es una lectura por petición sobre una tabla que crece. Está acotado: la clave primaria
es el hash y la búsqueda es un *seek* directo. El momento en que conviene mover las sesiones a
Redis está descrito en `arquitectura/06_escalabilidad.md`.

### Escritura de `ultimoAcceso`

Actualizar `ultimoAcceso` en cada petición convierte cada lectura en una escritura, que es la
forma más rápida de arruinar el rendimiento de la tabla. Se actualiza **solo si pasaron más de
60 segundos** desde el último registro. La precisión del vencimiento por inactividad se degrada
en un minuto, que es irrelevante frente a un umbral de 30 minutos, y el volumen de escrituras
baja uno o dos órdenes de magnitud.

---

## 4. Ciclo de vida de la sesión

| Evento | Qué ocurre |
|---|---|
| **Creación** | Al autenticar correctamente. Token nuevo, fila nueva |
| **Uso** | Cada petición resuelve la sesión y refresca `ultimoAcceso` (con la limitación de 60 s) |
| **Vencimiento por inactividad** | 30 minutos sin actividad. Se calcula contra `ultimoAcceso` |
| **Vencimiento absoluto** | 8 horas desde la creación, sin prórroga posible. Cubre una jornada laboral |
| **Cierre de sesión** | `POST /api/auth/logout` marca `revocadaEn` y borra la cookie |
| **Revocación administrativa** | Un ADMIN puede cerrar todas las sesiones de un usuario |
| **Cambio de contraseña** | Revoca **todas** las sesiones de ese usuario, incluida la actual |
| **Limpieza** | Tarea programada que borra sesiones vencidas hace más de 30 días |

**Los dos vencimientos son distintos y ambos hacen falta.** El de inactividad protege la
estación de trabajo desatendida. El absoluto acota cuánto sirve un token robado aunque el
atacante lo mantenga vivo con peticiones periódicas. Sin el segundo, una sesión secuestrada
dura para siempre.

### Rotación al autenticar

Al iniciar sesión se genera siempre un identificador nuevo y se descarta cualquier sesión previa
del navegador. Esto cierra la **fijación de sesión**: un atacante que logre plantar un
identificador conocido en el navegador de la víctima (por una URL manipulada, por ejemplo)
esperaría a que la víctima se autenticara para heredar una sesión ya privilegiada. Si el
identificador cambia en el momento del login, el que él plantó nunca queda autenticado.

---

## 5. La cookie

```
Set-Cookie: __Host-sid=<token>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800
```

| Atributo | Qué aporta |
|---|---|
| `__Host-` | Prefijo que el navegador hace cumplir: obliga a `Secure`, a `Path=/` y prohíbe `Domain`. Impide que un subdominio comprometido plante una cookie para el dominio principal |
| `HttpOnly` | JavaScript no puede leerla. Un XSS deja de poder robar la sesión directamente |
| `Secure` | Solo viaja por HTTPS |
| `SameSite=Strict` | El navegador no la adjunta en peticiones originadas en otro sitio. Es la primera barrera contra CSRF |
| `Path=/` | Impuesto por el prefijo `__Host-` |
| `Max-Age` | Coincide con el vencimiento absoluto |

`SameSite=Strict` en vez de `Lax`: con `Strict`, al llegar desde un enlace externo la primera
carga aparece sin sesión y hace falta un segundo salto. En una aplicación de gestión interna,
a la que se entra por su propia URL, esa molestia es aceptable a cambio de cerrar la vía de
CSRF por navegación.

---

## 6. CSRF

Con autenticación por cookie, el navegador adjunta las credenciales en toda petición al dominio,
incluidas las que origina otro sitio. Un formulario en una página maliciosa puede disparar un
`POST` contra la API y el navegador pondrá la cookie. Esta amenaza no existe con tokens en
cabecera, y es el precio directo de la decisión de la sección 2.

Dos barreras, porque ninguna basta sola:

**1. `SameSite=Strict`.** Detiene el caso común. No es suficiente por sí sola: hay navegadores
antiguos que la ignoran, y no protege de una petición originada en un subdominio propio
comprometido.

**2. Token anti-CSRF de doble envío.** Al crear la sesión se genera un segundo valor aleatorio,
asociado a ella:

- Se entrega en una cookie legible por JavaScript (`csrf-token`, sin `HttpOnly`).
- El frontend lo copia a la cabecera `X-CSRF-Token` en todo `POST`, `PATCH`, `PUT` y `DELETE`.
- El servidor exige que la cabecera coincida con el valor asociado a la sesión.

Funciona porque la política de mismo origen impide que un sitio ajeno **lea** la cookie, aunque
el navegador sí la envíe. Solo código servido desde nuestro propio origen puede copiar el valor
a la cabecera.

Los métodos `GET` y `HEAD` no exigen el token, bajo la condición de que sean realmente de solo
lectura. Un `GET` que modifica estado rompe esta protección y varias más; por eso ninguna ruta
de escritura usa `GET`.

---

## 7. Resolución de la sesión en cada petición

Un guard global, con las rutas públicas marcadas explícitamente, ejecuta en orden:

1. Leer la cookie `__Host-sid`. Si no está → `401 NO_AUTENTICADO`.
2. Calcular su SHA-256 y buscar la sesión. Si no existe → `401 SESION_INVALIDA`.
3. Si `revocadaEn` no es nulo → `401 SESION_REVOCADA`.
4. Si se pasó el vencimiento absoluto → revocar y `401 SESION_EXPIRADA`.
5. Si lleva más de 30 minutos sin actividad → revocar y `401 SESION_EXPIRADA`.
6. Cargar usuario y rol. Si el usuario está inactivo → `403 USUARIO_INACTIVO`.
7. Refrescar `ultimoAcceso`, como máximo una vez por minuto.
8. Publicar `{ usuarioId, rol }` en el contexto de la petición.

Los pasos 2 y 6 son una sola consulta, con un `JOIN` entre `Sesiones` y `Usuarios`. Si esa consulta llegara a pesar, el siguiente paso es cachear el resultado 30
segundos en memoria del proceso — pero eso reintroduce una ventana en la que una sesión
revocada sigue viva, así que solo se hace con un número medido que lo justifique.

---

## 8. Autorización por rol

`Usuarios.tipo_usuario` define tres roles. Un `RolesGuard` con decorador `@Roles(...)` los
verifica sobre el contexto que publicó el paso 8.

| Rol | Alcance |
|---|---|
| `ADMIN` | Todo, incluido el borrado lógico y la revocación de sesiones ajenas |
| `ANALISTA` | Crear, consultar, actualizar y cambiar el estado de cualquier crédito |
| `ASOCIADO` | Consultar **únicamente sus propios créditos**; crear su solicitud |

`tipo_usuario` y `tipo_persona` son ejes independientes, pero no cualquier combinación tiene
sentido: **`ADMIN` y `ANALISTA` son cargos, y un cargo lo ocupa una persona natural.** Solo el
`ASOCIADO` puede ser persona jurídica, porque ahí el usuario representa al deudor y un deudor sí
puede ser una empresa. La regla vive en `UsuariosService` y responde `422 REGLA_NEGOCIO`; no está
en la base porque un `CHECK` que cruza esa condición ocultaría una regla de negocio en el motor.

La restricción del `ASOCIADO` **no es un guard**. Se aplica como filtro forzado en el
repositorio: `WHERE deudor_id = <usuario de la sesión>`. Un guard que solo mira el rol permite
la ruta y deja pasar `GET /api/creditos/{id}` de un tercero — el rol es correcto, el recurso no.
Es la diferencia entre controlar el acceso a la ruta y controlarlo al recurso, y solo la segunda
protege datos.

---

## 9. Contraseñas

- Hash con **argon2id**, resistente a GPU y a ataques de canal lateral.
- La columna `Credenciales.password_hash` guarda el hash con sus parámetros. La contraseña en
  claro no se persiste, no se registra en logs y no aparece en ninguna respuesta.
- El interceptor de logging redacta el campo antes de escribir.
- Un intento fallido devuelve siempre `401 CREDENCIALES_INVALIDAS`, sin distinguir entre correo
  inexistente y contraseña errada: distinguirlos convierte el login en un oráculo para enumerar
  usuarios.
- Se aplica la misma latencia haya o no usuario, para no filtrar la diferencia por tiempo de
  respuesta.
- Límite de 5 intentos por minuto y por IP, y bloqueo temporal de la cuenta tras 10 fallos
  consecutivos.

No hay registro público de usuarios: las credenciales de una entidad financiera las crea un
administrador. Los usuarios iniciales entran por el *seed*; a partir de ahí, un `ADMIN` o un
`ANALISTA` da de alta a los demás con `POST /api/usuarios`.

**El alta no puede crear un `ADMIN`.** El administrador es quien reparte los permisos: si el
propio formulario puede fabricar otro, una sesión de administrador comprometida deja de ser un
incidente acotado y se vuelve permanente, porque el atacante se crea su propia cuenta antes de
que se revoque la que robó. Los administradores se aprovisionan con la carga inicial; el intento
por la API responde `422 REGLA_NEGOCIO` aunque el rol de la sesión sea `ADMIN`.

Un usuario y su credencial se escriben **en la misma transacción**, o no se escribe ninguno de
los dos. Una credencial huérfana no puede existir, y un operador sin credencial es una cuenta
que nadie puede usar. De ahí las dos reglas del servicio:

- `correo` y `password` se envían juntos o no se envía ninguno.
- `ADMIN` y `ANALISTA` los exigen. Un `ASOCIADO` puede existir sin ellos: es un deudor al que
  todavía no se le dio acceso, y es justo lo que hace el *find-or-create* al registrar un crédito
  a nombre de alguien que no estaba en el sistema.

La contraseña pide **12 caracteres como mínimo**. Un mínimo corto no lo compensa ningún algoritmo
de hash: argon2 encarece cada intento, no reduce el número de contraseñas posibles.

---

## 10. Endpoints

| Método | Ruta | Descripción | Sesión requerida |
|---|---|---|---|
| `POST` | `/api/auth/login` | Autentica y crea la sesión | No |
| `POST` | `/api/auth/logout` | Revoca la sesión actual | Sí |
| `GET` | `/api/auth/yo` | Usuario, rol y tipo de persona de la sesión actual | Sí |
| `GET` | `/api/auth/sesiones` | Sesiones activas del usuario (IP, agente, último acceso) | Sí |
| `DELETE` | `/api/auth/sesiones/:id` | Cierra una sesión concreta | Sí |
| `POST` | `/api/usuarios` | Da de alta un usuario y, si se piden, sus credenciales | Sí (ADMIN, ANALISTA) |
| `DELETE` | `/api/usuarios/:id/sesiones` | Cierra todas las sesiones de un usuario | Sí (ADMIN) |

No existe endpoint de refresco: la sesión se prorroga sola con el uso, hasta el tope absoluto.
Esa es otra simplificación que trae el modelo de sesión frente a los tokens.

---

## 11. Consumo desde el navegador

La cookie impone condiciones en el cliente que conviene tener presentes:

- Todas las peticiones se envían con `credentials: 'include'`. Sin eso, el navegador no adjunta
  la cookie y la API responde 401 de forma sistemática.
- CORS debe declarar el origen exacto del frontend y `credentials: true`. **El comodín `*` es
  incompatible con cookies**: el navegador rechaza la respuesta.
- En desarrollo, frontend y API están en puertos distintos (`5173` y `3000`), lo que las hace
  orígenes cruzados. Dos salidas: declarar el origen exacto en CORS, o poner el `proxy` de Vite
  para que ambos compartan origen. La segunda es preferible, porque hace que desarrollo se
  parezca a producción, donde ambos van detrás del mismo dominio.
- `Secure` exige HTTPS. En `localhost` los navegadores lo permiten sobre HTTP; el prefijo
  `__Host-` también se acepta ahí.

---

## 12. Decisiones y compensaciones

| Decisión | Se gana | Se paga |
|---|---|---|
| Sesión en servidor en vez de token autocontenido | Revocación inmediata, cierre de sesión real, auditoría de accesos | Una consulta por petición; la API guarda estado en un almacén compartido |
| Sesiones en SQL Server en vez de Redis | Un componente menos; durabilidad; historia auditable | Más lento que Redis; la tabla crece y hay que limpiarla |
| Token hasheado en la tabla | Una copia de la tabla no entrega sesiones vivas | Ninguno relevante |
| `SameSite=Strict` | Cierra el CSRF por navegación | Al llegar de un enlace externo hace falta un segundo salto |
| Doble vencimiento (inactividad y absoluto) | Acota la ventana de un token robado | El usuario vuelve a autenticarse cada jornada |
| `ultimoAcceso` con límite de 1 escritura por minuto | Evita una escritura por petición | El vencimiento por inactividad tiene un minuto de imprecisión |
| Alta de usuarios por administrador, sin registro público | Nadie se auto-vincula a la entidad; la identidad la valida quien da el alta | Hace falta una pantalla de administración, y el primer administrador sigue saliendo del *seed* |
| `ADMIN` y `ANALISTA` obligados a persona natural | Cierra combinaciones sin sentido de perfil | Una regla más que mantener en el servicio; la base no la hace cumplir |
