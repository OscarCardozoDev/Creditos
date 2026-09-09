#!/bin/bash
# Punto de control de la fase 5.4: las 20 peticiones del ROADMAP.
# Uso: bash pruebas-manuales/5.4-creditos.sh [http://localhost:3010/api]
API="${1:-http://localhost:3010/api}"
AQUI=$(dirname "$0")
DIR=$(mktemp -d)
CLAVE='Desarrollo.2026'
ok=0; fallo=0

# Autentica un correo y guarda su cookie jar con el nombre dado.
login() {
  curl -s -o /dev/null -c "$DIR/$2.txt" -X POST "$API/auth/login" \
    -H 'Content-Type: application/json' -d "{\"correo\":\"$1\",\"password\":\"$CLAVE\"}"
}

# Lanza una peticion con esa sesion y deja el codigo en CODIGO y el cuerpo en salida.json.
pedir() {
  local jar=$1 metodo=$2 ruta=$3 cuerpo=$4 ifmatch=$5
  local csrf; csrf=$(grep 'csrf-token' "$DIR/$jar.txt" | awk '{print $7}')
  local args=(-s -b "$DIR/$jar.txt" -o "$DIR/salida.json" -w '%{http_code}'
              -X "$metodo" "$API$ruta" -H 'Content-Type: application/json' -H "X-CSRF-Token: $csrf")
  [ -n "$ifmatch" ] && args+=(-H "If-Match: $ifmatch")
  [ -n "$cuerpo" ] && args+=(-d "$cuerpo")
  CODIGO=$(curl "${args[@]}")
}

# Lee un campo del ultimo cuerpo recibido, por su ruta con puntos.
campo() { python "$AQUI/campo.py" "$DIR/salida.json" "$1"; }

# Compara lo esperado con lo obtenido y lleva la cuenta.
verificar() {
  if [ "$3" = "$4" ]; then
    printf '  %-3s OK   %s\n' "$1" "$2"; ok=$((ok + 1))
  else
    printf '  %-3s MAL  %s\n       esperaba [%s], obtuvo [%s]\n' "$1" "$2" "$3" "$4"
    head -c 240 "$DIR/salida.json"; echo; fallo=$((fallo + 1))
  fi
}

# Devuelve la version actual del credito, para la cabecera If-Match.
version_de() { pedir analista GET "/creditos/$1"; campo data.version; }

login admin@local admin
login analista@local analista
login asociado@local asociado

IDENT="99$RANDOM$RANDOM"
BASE="{\"identificacionAsociado\":\"$IDENT\",\"nombreAsociado\":\"Deudor De Prueba\",\"tipoCredito\":\"LIBRE_INVERSION\",\"valorSolicitado\":15000000,\"tasaInteres\":1.5,\"numeroCuotas\":36,\"formaPago\":\"NOMINA\"}"

echo "== Fase 5.4 - Creditos =="

pedir analista POST /creditos "$BASE"
ID=$(campo data.id); NUM=$(campo data.numeroCredito)
FORMATO=$(echo "$NUM" | grep -qE '^CR-[0-9]{4}-[0-9]{6}$' && echo si || echo no)
verificar 1 "POST valido -> 201, SOLICITADO, numero con formato" "201|SOLICITADO|si" "$CODIGO|$(campo data.estado)|$FORMATO"

pedir analista POST /creditos "$BASE"
verificar 2 "repetir la misma peticion -> 409 CREDITO_DUPLICADO" "409|CREDITO_DUPLICADO" "$CODIGO|$(campo error.code)"

pedir analista POST /creditos "${BASE/15000000/-1}"
verificar 3 "valorSolicitado -1 -> 400" "400" "$CODIGO"

pedir analista POST /creditos "{\"identificacionAsociado\":\"98$RANDOM$RANDOM\",\"nombreAsociado\":\"Persona Natural\",\"tipoPersona\":\"PERSONA_NATURAL\",\"tipoCredito\":\"COMERCIAL\",\"valorSolicitado\":50000000,\"numeroCuotas\":36,\"formaPago\":\"CAJA\"}"
verificar 4 "COMERCIAL a persona natural -> 422 REGLA_NEGOCIO" "422|REGLA_NEGOCIO" "$CODIGO|$(campo error.code)"

pedir analista POST /creditos "{\"identificacionAsociado\":\"97$RANDOM$RANDOM\",\"nombreAsociado\":\"Otro Deudor\",\"tipoCredito\":\"LIBRANZA\",\"valorSolicitado\":8000000,\"numeroCuotas\":24,\"formaPago\":\"CAJA\"}"
verificar 5 "LIBRANZA con formaPago CAJA -> 422 REGLA_NEGOCIO" "422|REGLA_NEGOCIO" "$CODIGO|$(campo error.code)"

pedir analista POST /creditos "${BASE/\"formaPago\":\"NOMINA\"/\"formaPago\":\"NOMINA\",\"estado\":\"APROBADO\"}"
verificar 6 "enviar estado en el cuerpo del POST -> 400" "400" "$CODIGO"

pedir analista GET "/creditos/$ID"
TIENE=$(campo data.transicionesPermitidas | grep -q EN_ESTUDIO && echo si || echo no)
verificar 7 "GET por id -> 200 con cuotaMensual y transiciones" "200|542285.93|si" "$CODIGO|$(campo data.cuotaMensual)|$TIENE"

pedir analista GET "/creditos?estado=SOLICITADO&page=1&limit=5"
COHERENTE=$(python -c "
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
solo = all(c['estado'] == 'SOLICITADO' for c in d['data'])
print('si' if solo and d['meta']['limit'] == 5 and len(d['data']) <= 5 else 'no')" "$DIR/salida.json")
verificar 8 "listado filtrado por estado, con meta coherente" "200|si" "$CODIGO|$COHERENTE"

pedir analista GET "/creditos?sort=tasaInteres:asc"
verificar 9 "sort por campo de la lista blanca -> 200" "200" "$CODIGO"

pedir analista GET "/creditos?sort=%3B+DROP+TABLE+Creditos--"
verificar 10 "sort con inyeccion -> 400 y la base intacta" "400" "$CODIGO"

pedir analista PATCH "/creditos/$ID/estado" '{"estado":"EN_ESTUDIO","observacion":"Pasa a estudio"}' "$(version_de "$ID")"
CAMBIO=$CODIGO
pedir analista GET "/creditos/$ID/historial"
verificar 11 "PATCH a EN_ESTUDIO -> 200 y fila nueva en el historial" "200|2" "$CAMBIO|$(campo data | python -c 'import json,sys;print(len(json.load(sys.stdin)))')"

pedir analista PATCH "/creditos/$ID/estado" '{"estado":"RECHAZADO","observacion":"No cumple capacidad de pago"}' "$(version_de "$ID")"
pedir analista PATCH "/creditos/$ID/estado" '{"estado":"DESEMBOLSADO"}' "$(version_de "$ID")"
verificar 12 "RECHAZADO -> DESEMBOLSADO -> 422 TRANSICION_INVALIDA" "422|TRANSICION_INVALIDA" "$CODIGO|$(campo error.code)"

IDENT2="96$RANDOM$RANDOM"
pedir analista POST /creditos "${BASE/$IDENT/$IDENT2}"
ID2=$(campo data.id)
pedir analista PATCH "/creditos/$ID2/estado" '{"estado":"RECHAZADO"}' "$(version_de "$ID2")"
verificar 13 "PATCH a RECHAZADO sin observacion -> 400" "400" "$CODIGO"

pedir analista PATCH "/creditos/$ID2" '{"numeroCuotas":24}' 'AAAAAAAAAAE='
verificar 14 "If-Match con version obsoleta -> 409 CONCURRENCIA_CONFLICTO" "409|CONCURRENCIA_CONFLICTO" "$CODIGO|$(campo error.code)"

pedir analista PATCH "/creditos/$ID2/estado" '{"estado":"EN_ESTUDIO"}' "$(version_de "$ID2")"
pedir analista PATCH "/creditos/$ID2/estado" '{"estado":"APROBADO","observacion":"Aprobado"}' "$(version_de "$ID2")"
pedir analista PATCH "/creditos/$ID2" '{"numeroCuotas":24}' "$(version_de "$ID2")"
verificar 15 "PATCH de datos sobre un APROBADO -> 422 CREDITO_INMUTABLE" "422|CREDITO_INMUTABLE" "$CODIGO|$(campo error.code)"

pedir analista GET "/creditos/$ID2/historial"
ORDENADO=$(python -c "
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))['data']
fechas = [a['fecha'] for a in d]
print('si' if fechas == sorted(fechas, reverse=True) and all(a['usuarioNombre'] for a in d) else 'no')" "$DIR/salida.json")
verificar 16 "historial descendente y con nombre de usuario" "200|si" "$CODIGO|$ORDENADO"

pedir admin DELETE "/creditos/$ID"
BORRADO=$CODIGO
pedir analista GET "/creditos/$ID"
verificar 17 "DELETE -> 204 y luego GET -> 404" "204|404" "$BORRADO|$CODIGO"

pedir analista GET "/creditos?limit=100"
AUSENTE=$(python -c "
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
print('si' if not any(c['id'] == sys.argv[2] for c in d['data']) else 'no')" "$DIR/salida.json" "$ID")
verificar 18 "el credito borrado no aparece en el listado" "si" "$AUSENTE"

pedir asociado GET "/creditos/$ID2"
verificar 19 "ASOCIADO consultando un credito ajeno -> 403 SIN_PERMISO" "403|SIN_PERMISO" "$CODIGO|$(campo error.code)"

pedir analista GET /creditos/resumen
CUADRA=$(python -c "
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))['data']
print('si' if d['total'] == sum(f['total'] for f in d['porEstado']) else 'no')" "$DIR/salida.json")
verificar 20 "resumen con conteos que cuadran" "200|si" "$CODIGO|$CUADRA"

echo
echo "  Resultado: $ok correctas, $fallo con fallo"
rm -rf "$DIR"
[ "$fallo" -eq 0 ]
