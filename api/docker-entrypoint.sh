#!/bin/sh
# Aplica el esquema antes de escuchar: el codigo nunca corre contra una base atrasada.
set -e
node dist/crear-base.js
node ./node_modules/typeorm/cli.js -d dist/config/data-source.js migration:run
node dist/semilla.js
exec node dist/main.js
