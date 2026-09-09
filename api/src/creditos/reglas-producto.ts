import { ReglaNegocioException } from '../comun/errores/excepciones';
import { FormaPago, TipoCredito, TipoPersona } from '../entidades/enums';
import { parametrosDe } from '../simulacion/productos';

/**
 * Reglas que cruzan Creditos con Usuarios. Viven aqui y no en un CHECK porque un CHECK solo ve
 * la fila que se escribe: alcanzar otra tabla exigiria un trigger, que esconde negocio en el motor.
 */

/** La libranza se descuenta de la nomina: esa es la definicion del producto. */
const FORMA_PAGO_OBLIGATORIA: Partial<Record<TipoCredito, FormaPago>> = {
  [TipoCredito.LIBRANZA]: FormaPago.NOMINA,
};

/** Rechaza el producto si el perfil del deudor no lo admite. */
export function exigirPerfilCompatible(tipoCredito: TipoCredito, tipoPersona: TipoPersona): void {
  const perfiles = parametrosDe(tipoCredito).perfiles;
  if (!perfiles.includes(tipoPersona)) {
    throw new ReglaNegocioException(`El credito ${tipoCredito} no se otorga a ${tipoPersona}.`);
  }
}

/** Rechaza la forma de pago si el producto exige una concreta. */
export function exigirFormaDePagoCompatible(tipoCredito: TipoCredito, formaPago: FormaPago): void {
  const obligatoria = FORMA_PAGO_OBLIGATORIA[tipoCredito];
  if (obligatoria && formaPago !== obligatoria) {
    throw new ReglaNegocioException(`El credito ${tipoCredito} solo admite forma de pago ${obligatoria}.`);
  }
}
