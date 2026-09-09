import { createHmac, timingSafeEqual } from 'node:crypto';

/** Firma el cuerpo con el secreto compartido, para que el receptor sepa que salio de aqui. */
export function firmar(cuerpo: string, secreto: string): string {
  return 'sha256=' + createHmac('sha256', secreto).update(cuerpo).digest('hex');
}

/** Compara dos firmas en tiempo constante: la igualdad simple filtra informacion por el tiempo. */
export function firmasIguales(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
