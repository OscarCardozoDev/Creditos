"""Lee un campo de un JSON por su ruta con puntos. Uso: campo.py salida.json data.estado"""
import json
import sys


def leer(dato, ruta):
    """Recorre el JSON siguiendo la ruta, devolviendo cadena vacia si algo no existe."""
    for parte in ruta.split('.'):
        if parte == '':
            continue
        if isinstance(dato, list):
            dato = dato[int(parte)]
        elif isinstance(dato, dict) and parte in dato:
            dato = dato[parte]
        else:
            return ''
    return dato


with open(sys.argv[1], encoding='utf-8') as archivo:
    valor = leer(json.load(archivo), sys.argv[2])

print(json.dumps(valor) if isinstance(valor, (list, dict)) else valor)
