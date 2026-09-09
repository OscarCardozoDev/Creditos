# Seguridad

Mecanismos transversales de protección. El detalle de sesiones, roles y contraseñas está en
`modulos/01_autenticacion_y_sesiones.md`; aquí queda lo que aplica a todo el sistema.

---

## 1. Capas de defensa

Una petición atraviesa, en este orden:

1. **TLS** terminado en el proxy inverso.
2. **Limitador de peticiones**, por IP y por ruta.
3. **`helmet`**, cabeceras de seguridad.
4. **CORS**, contra el origen declarado en configuración.
5. **Guard de sesión**, que resuelve la cookie `__Host-sid`.
6. **Verificación anti-CSRF** en los métodos de escritura.
7. **Guard de roles**, según el rol que declara el endpoint.
8. **`ValidationPipe`** con lista blanca estricta de campos.
9. **Servicio de dominio**, que filtra por recurso además de por rol.
10. **SQL Server**, con consultas parametrizadas y restricciones de integridad.

Ninguna capa es suficiente por sí sola. El orden importa: el trabajo barato descarta primero.

---

## 2. Transporte

| Medida | Efecto |
|---|---|
| TLS 1.2 o superior, terminado en el proxy | Sin él, la cookie de sesión viaja legible por la red |
| HSTS | Impide la degradación a HTTP tras la primera visita |
| Redirección de HTTP a HTTPS | Ninguna petición útil viaja en claro |
| `helmet` | Cabeceras contra clickjacking, detección de tipo MIME y referencias con fuga de datos |

---

## 3. Control de origen

CORS declara el origen exacto del frontend, tomado de configuración. El comodín `*` no es una
opción: además de abrir la API a cualquier sitio, es **incompatible con credenciales**, y el
navegador rechaza la respuesta cuando se envían cookies.

En desarrollo, el `proxy` de Vite hace que frontend y API compartan origen. Es preferible a
relajar CORS, porque reproduce la topología de producción, donde ambos van detrás del mismo
dominio.

---

## 4. CSRF

La autenticación por cookie introduce esta amenaza: el navegador adjunta las credenciales en toda
petición al dominio, incluidas las originadas en otro sitio. Un formulario alojado en una página
maliciosa puede disparar un `POST` contra la API y el navegador pondrá la cookie.

Dos barreras:

**`SameSite=Strict` en la cookie de sesión.** El navegador no la adjunta en peticiones que
provienen de otro sitio. Detiene el caso general, pero no basta: hay navegadores que la ignoran y
no cubre una petición originada en un subdominio propio comprometido.

**Token anti-CSRF de doble envío.** Al crear la sesión se genera un segundo valor aleatorio
asociado a ella. Viaja en una cookie legible por JavaScript; el frontend lo copia a la cabecera
`X-CSRF-Token` en todo método de escritura; el servidor exige que coincida con el valor de la
sesión.

Funciona porque la política de mismo origen impide que un sitio ajeno **lea** la cookie, aunque
el navegador sí la envíe. Solo código servido desde el propio origen puede copiar el valor a una
cabecera.

Los métodos `GET` y `HEAD` no exigen el token, bajo la condición de que sean realmente de solo
lectura. Un `GET` que modifica estado anula esta protección; por eso ninguna ruta de escritura
usa `GET`.

---

## 5. Entrada de datos

| Medida | Qué previene |
|---|---|
| `ValidationPipe` con `whitelist` y `forbidNonWhitelisted` | Asignación masiva: los campos no declarados hacen fallar la petición en lugar de colarse |
| `estado` ausente de todo DTO de escritura | Que se pueda saltar la máquina de estados con una sola petición |
| Consultas parametrizadas, sin concatenación | Inyección SQL |
| Lista blanca de campos ordenables | El nombre de columna no puede parametrizarse; es el único punto por donde entraría una inyección |
| Límite de 100 en el tamaño de página | Una petición no puede pedir la tabla entera |
| Cuerpo máximo de 100 kB | Agotamiento de memoria |
| Contenido esperado `application/json` | Envíos de formulario cruzados desde otro sitio |

---

## 6. Protección de credenciales y datos

- Las contraseñas se derivan con **argon2id**. Nunca se persiste, registra ni devuelve la
  contraseña en claro.
- Los identificadores de sesión se guardan **hasheados**: una copia de la tabla no entrega
  sesiones activas.
- Los intentos de acceso fallidos responden siempre igual, sin distinguir correo inexistente de
  contraseña errada, y con latencia equivalente. Distinguirlos convierte el login en un oráculo
  para enumerar usuarios.
- Límite de 5 intentos por minuto y por IP; bloqueo temporal de la cuenta tras 10 fallos
  consecutivos.
- El interceptor de registro redacta contraseñas, tokens, cookies y cabeceras de autorización
  antes de escribir cualquier línea de log.
- Las respuestas de error nunca incluyen trazas de pila, mensajes del motor de base de datos ni
  nombres de tabla o columna. Un error de SQL Server devuelto tal cual es un mapa del esquema
  entregado a quien esté sondeando la API.

---

## 7. Integración con sistemas externos

**Salida:** el cuerpo se firma con HMAC-SHA256 y un secreto compartido, en la cabecera
`X-Signature`. La URL de destino sale de configuración y nunca de datos de la petición: si
viniera del usuario, el servidor se convertiría en un escáner de la red interna. Timeout de 5
segundos y sin seguir redirecciones.

**Entrada:** la firma se verifica sobre el cuerpo crudo, antes de parsearlo, con comparación en
tiempo constante. Se rechazan eventos con marca de tiempo de más de 5 minutos, para impedir la
reproducción de un evento capturado, y se descartan identificadores de evento ya procesados.

Detalle completo en `modulos/05_notificaciones.md`.

---

## 8. Secretos y configuración

- Todos los secretos llegan por variables de entorno. Ninguno se escribe en el código, en la
  imagen del contenedor ni en el repositorio.
- El repositorio publica un `.env.example` con las claves y sin un solo valor real.
- La configuración se valida al arrancar: **si falta una variable obligatoria, la aplicación no
  inicia.** Es preferible no arrancar a hacerlo con un secreto en blanco, porque un secreto vacío
  produce firmas que cualquiera puede reproducir.
- En producción los valores provienen de un gestor de secretos y se inyectan al iniciar el
  contenedor.

---

## 9. Superficie expuesta

La documentación interactiva de la API describe cada endpoint, sus parámetros y sus errores: es
también un mapa de la superficie de ataque. En producción queda deshabilitada o restringida por
configuración.

---

## 10. Fuera del alcance actual

Se identifican explícitamente para no darlos por resueltos:

- Segundo factor de autenticación para el rol administrador.
- Rotación automática de secretos.
- Auditoría de accesos, distinta de la auditoría de cambios.
- Cortafuegos de aplicación y mitigación de denegación de servicio en el borde.
- Cifrado en reposo de la base y enmascaramiento de datos personales en entornos de prueba.
- Límite de sesiones simultáneas por usuario.

---

## 11. Decisiones y compensaciones

| Decisión | Se gana | Se paga |
|---|---|---|
| Sesión en cookie en vez de token en cabecera | Revocación inmediata; el identificador no es legible ni útil fuera del servidor | Aparece el CSRF y hay que defenderse de él |
| `SameSite=Strict` | Cierra el CSRF por navegación | Llegar desde un enlace externo exige un segundo salto |
| CORS con origen declarado | Solo el frontend propio consume la API | Cada entorno nuevo requiere configuración |
| `forbidNonWhitelisted` | Los campos no previstos fallan en lugar de colarse | Un cliente desactualizado recibe 400 en vez de que se ignore el campo sobrante |
| No arrancar sin configuración completa | Ningún despliegue queda con secretos vacíos | Un error de configuración impide el arranque en lugar de degradarse |
| Errores genéricos hacia el cliente | No se filtra estructura interna | Diagnosticar exige consultar los logs por `requestId` |
