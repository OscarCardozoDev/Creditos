import { CodigoError } from './codigos-error';

/** Traduce la violacion de una restriccion de SQL Server al codigo del catalogo que le corresponde. */
export function traducirErrorSql(error: unknown): { codigo: CodigoError; mensaje: string } | null {
  const mensaje = (error as { message?: string })?.message ?? '';
  const numero = (error as { number?: number })?.number;

  // 2601/2627: indice unico o restriccion UNIQUE. 547: CHECK o llave foranea.
  if (numero === 2601 || numero === 2627) {
    if (mensaje.includes('UX_Creditos_Duplicado')) {
      return {
        codigo: 'CREDITO_DUPLICADO',
        mensaje: 'Ya existe una solicitud en tramite del mismo tipo y valor para este asociado.',
      };
    }
    if (mensaje.includes('UQ_Usuarios_Ident')) {
      return {
        codigo: 'USUARIO_DUPLICADO',
        mensaje: 'Ya existe un usuario con esa identificacion.',
      };
    }
    if (mensaje.includes('UQ_Credenciales_Correo')) {
      return {
        codigo: 'USUARIO_DUPLICADO',
        mensaje: 'Ya existe una credencial con ese correo.',
      };
    }
    return {
      codigo: 'CREDITO_DUPLICADO',
      mensaje: 'El registro duplica uno existente.',
    };
  }

  if (numero === 547 && /CK_[A-Za-z_]+/.test(mensaje)) {
    return {
      codigo: 'VALIDATION_ERROR',
      mensaje: 'Los datos enviados no cumplen una restriccion del modelo.',
    };
  }

  return null;
}
