# Manejo de Errores

Contrato de errores de la API: formato único, catálogo de códigos y criterio para elegir cada
uno.

---

## 1. Un solo punto de construcción

Todas las respuestas de error salen de un filtro global de excepciones. Ningún controlador arma
una respuesta de error por su cuenta.

Si cada controlador construyera su propio JSON, el formato divergiría y el cliente terminaría con
una rama por endpoint.

---

## 2. Formato

Error:

```json
{
  "success": false,
  "error": {
    "code": "CREDITO_NOT_FOUND",
    "message": "El crédito no existe",
    "details": [],
    "requestId": "01J8XQ4M7Z9K2N"
  }
}
```

Éxito, mediante el interceptor simétrico:

```json
{
  "success": true,
  "data": { },
  "meta": { }
}
```

La simetría permite que el cliente lea siempre `success` primero y decida sin inspeccionar el
código HTTP.

`code` es un identificador estable, pensado para que el cliente lo compare; `message` es texto
para personas y puede cambiar sin romper integraciones. `details` lleva el error por campo cuando
la validación falla.

---

## 3. Catálogo

| HTTP | Código | Situación |
|---|---|---|
| 400 | `VALIDATION_ERROR` | El cuerpo o los parámetros no cumplen la forma esperada |
| 401 | `NO_AUTENTICADO` | No hay cookie de sesión |
| 401 | `SESION_INVALIDA` | La cookie no corresponde a ninguna sesión |
| 401 | `SESION_EXPIRADA` | Venció por inactividad o por tope absoluto |
| 401 | `SESION_REVOCADA` | Se cerró desde otro dispositivo o la revocó un administrador |
| 401 | `CREDENCIALES_INVALIDAS` | Acceso fallido |
| 401 | `FIRMA_INVALIDA` | El webhook entrante trae una firma que no coincide, o un evento vencido |
| 403 | `CSRF_INVALIDO` | Falta la cabecera anti-CSRF o no coincide |
| 403 | `SIN_PERMISO` | Rol insuficiente, o un asociado accediendo a un crédito ajeno |
| 403 | `USUARIO_INACTIVO` | La sesión es válida pero el usuario está bloqueado |
| 404 | `CREDITO_NOT_FOUND` | No existe, o está borrado lógicamente |
| 404 | `USUARIO_NOT_FOUND` | El usuario no existe |
| 404 | `CUOTA_NOT_FOUND` | La cuota no existe en el plan de ese crédito |
| 404 | `RECURSO_NOT_FOUND` | Ruta inexistente. Es el genérico del filtro, no lo lanza ningún servicio |
| 409 | `CREDITO_DUPLICADO` | Ya hay una solicitud viva equivalente |
| 409 | `USUARIO_DUPLICADO` | Ya existe un usuario con esa identificación o ese correo |
| 409 | `CONCURRENCIA_CONFLICTO` | La versión enviada en `If-Match` quedó obsoleta |
| 422 | `TRANSICION_INVALIDA` | El cambio de estado no está permitido desde el estado actual |
| 422 | `REGLA_NEGOCIO` | Incumple una regla del producto o del perfil |
| 422 | `CREDITO_INMUTABLE` | Se intenta editar un crédito que ya salió de los estados editables |
| 429 | `DEMASIADAS_PETICIONES` | Se superó el límite de frecuencia |
| 500 | `ERROR_INTERNO` | Cualquier situación no contemplada |

---

## 4. Criterio de selección

La diferencia entre los códigos de error del cliente es la que más se presta a confusión, y la
que determina si un cliente puede reaccionar correctamente.

![Criterio de selección de códigos HTTP](../diagramas/Criterio%20de%20seleccion%20de%20codigos%20HTTP.svg)

Las preguntas, en orden:

1. **¿Se entiende la petición?** Si no, `400`: la forma es incorrecta.
2. **¿Quien pide está identificado?** Si no, `401`: falta la sesión o venció.
3. **¿Tiene permiso sobre ese recurso?** Si no, `403`.
4. **¿Existe el recurso?** Si no, `404`.
5. **¿Choca con el estado actual del recurso?** Si sí, `409`: duplicado o versión obsoleta.
6. **Si llegó hasta aquí y aun así no procede**, `422`: el negocio no lo permite.

Con ejemplos concretos:

| Petición | Respuesta | Por qué |
|---|---|---|
| `numeroCuotas: -5` | 400 | No es un número de cuotas válido en ningún contexto |
| `numeroCuotas: 300` en un crédito de consumo | 422 | Es un número válido; el producto no lo admite |
| Segunda solicitud idéntica en trámite | 409 | Choca con el estado actual de los datos |
| `RECHAZADO → DESEMBOLSADO` | 422 | La petición es correcta; la máquina de estados la prohíbe |
| Asociado consultando un crédito ajeno | 403 | Está identificado, pero el recurso no le corresponde |

**401 y 403 no son intercambiables.** 401 significa "no sé quién eres"; 403, "sé quién eres y no
puedes". Un cliente que recibe 401 debe llevar al usuario a autenticarse; ante un 403, hacerlo
sería un bucle.

**404 y no 410 para el borrado lógico.** Para quien consume la API el recurso no existe.
Distinguir "nunca existió" de "fue borrado" entrega información a quien no debería tenerla.

---

## 5. Trazabilidad

Un middleware genera un `requestId` por petición, lo mantiene disponible durante todo el
procesamiento, lo devuelve en la cabecera `X-Request-Id` y lo incluye en cada línea de registro.

Cuando un usuario reporta un problema con ese identificador, lleva directo a la traza completa de
esa petición: qué se recibió, qué consultas se ejecutaron y dónde falló.

Hacia el cliente nunca viajan trazas de pila, mensajes del motor de base de datos ni nombres de
tabla o de columna. Un error de SQL Server devuelto tal cual describe la estructura interna a
quien esté sondeando la API. Se registra completo en el log y se responde `ERROR_INTERNO`.

En sentido inverso, nunca se registran contraseñas, cookies, cabeceras de autorización ni cuerpos
de peticiones de acceso.

---

## 6. Errores de la base de datos

Las violaciones de restricción no se devuelven crudas: se traducen.

| Violación | Respuesta |
|---|---|
| `UX_Creditos_Duplicado` | 409 `CREDITO_DUPLICADO` |
| `UQ_Usuarios_Ident` | 409 con el mensaje correspondiente |
| `CK_Creditos_Valor`, `CK_Creditos_Cuotas` | 400 `VALIDATION_ERROR` |
| Cualquier otra | 500 genérico, con el detalle solo en el log |

Que la base rechace algo que el servicio ya había verificado no es redundancia inútil: significa
que dos peticiones concurrentes pasaron ambas la verificación previa y solo una alcanzó a
escribir. La traducción convierte esa condición de carrera en la misma respuesta que habría dado
el servicio.

---

## 7. Decisiones y compensaciones

| Decisión | Se gana | Se paga |
|---|---|---|
| Filtro global único | Formato uniforme garantizado | Los errores nuevos deben registrarse en el catálogo central |
| Envoltura `success` en todas las respuestas | El cliente lee siempre igual | Un nivel más de anidación en cada respuesta |
| `code` estable y `message` libre | El texto se puede mejorar sin romper integraciones | Hay que mantener dos campos alineados |
| 422 separado de 400 | El cliente distingue un error de forma de uno de negocio | Exige criterio al elegir; la distinción se puede aplicar mal |
| Errores internos genéricos | No se filtra estructura | Diagnosticar obliga a consultar logs por `requestId` |
