import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { ExcepcionDominio } from '../comun/errores/excepciones';
import { Credencial } from '../entidades/credencial.entidad';
import { MotivoRevocacion } from '../entidades/enums';
import { Sesion } from '../entidades/sesion.entidad';
import { CredencialesRepository } from './credenciales.repository';
import { UsuarioSesion } from './decoradores';
import { SesionesRepository } from './sesiones.repository';

/** Fallos seguidos tras los que la cuenta queda bloqueada un rato. */
const FALLOS_PARA_BLOQUEO = 10;
const MINUTOS_DE_BLOQUEO = 15;

/** El refresco de ultimoAcceso se limita a uno por minuto: si no, cada lectura seria una escritura. */
const SEGUNDOS_ENTRE_REFRESCOS = 60;

export interface SesionCreada {
  token: string;
  csrfToken: string;
  expiraEn: Date;
}

@Injectable()
export class AuthService {
  /** Hash de descarte: se verifica contra el cuando el correo no existe, para no filtrar la diferencia por tiempo. */
  private hashDeDescarte = '';

  constructor(
    private readonly sesiones: SesionesRepository,
    private readonly credenciales: CredencialesRepository,
    private readonly config: ConfigService,
  ) {}

  /** Autentica al usuario y le abre una sesion nueva, descartando la que traia el navegador. */
  async iniciarSesion(
    correo: string,
    password: string,
    ip: string | null,
    agente: string | null,
    tokenPrevio?: string,
  ): Promise<SesionCreada> {
    const credencial = await this.credenciales.buscarPorCorreo(correo);
    const correcta = await this.verificarPassword(credencial, password);

    if (!credencial || !correcta) {
      if (credencial) {
        await this.registrarFallo(credencial);
      }
      throw new ExcepcionDominio('CREDENCIALES_INVALIDAS', 'El correo o la contrasena no son correctos.');
    }

    this.exigirCuentaDesbloqueada(credencial);
    this.exigirUsuarioActivo(credencial);
    await this.credenciales.limpiarIntentos(credencial.usuarioId);

    if (tokenPrevio) {
      await this.cerrarSesion(tokenPrevio);
    }
    return this.abrirSesion(credencial.usuarioId, ip, agente);
  }

  /** Revoca la sesion que corresponde al token recibido. */
  async cerrarSesion(token: string): Promise<void> {
    await this.sesiones.revocar(this.hashDeToken(token), MotivoRevocacion.CIERRE_SESION);
  }

  /** Resuelve la cookie en el usuario de la sesion, o lanza el 401 que corresponda. */
  async resolverSesion(token: string): Promise<UsuarioSesion> {
    const tokenHash = this.hashDeToken(token);
    const sesion = await this.sesiones.buscarConUsuario(tokenHash);

    if (!sesion) {
      throw new ExcepcionDominio('SESION_INVALIDA', 'La sesion no existe.');
    }
    if (sesion.revocadaEn) {
      throw new ExcepcionDominio('SESION_REVOCADA', 'La sesion fue cerrada.');
    }
    await this.exigirSesionVigente(sesion);
    if (!sesion.usuario.activo) {
      throw new ExcepcionDominio('USUARIO_INACTIVO', 'El usuario esta inactivo.');
    }
    await this.refrescarUltimoAcceso(sesion);

    return {
      usuarioId: sesion.usuarioId,
      rol: sesion.usuario.tipoUsuario,
      nombre: sesion.usuario.nombreRazonSocial,
      tipoPersona: sesion.usuario.tipoPersona,
      tokenHash,
      csrfToken: sesion.csrfToken,
    };
  }

  /** Devuelve las sesiones vivas de un usuario. */
  listarSesiones(usuarioId: string): Promise<Sesion[]> {
    return this.sesiones.listarActivas(usuarioId);
  }

  /** Cierra una sesion concreta. */
  async revocarSesion(tokenHash: string, motivo: MotivoRevocacion): Promise<void> {
    await this.sesiones.revocar(tokenHash, motivo);
  }

  /** Cierra todas las sesiones vivas de un usuario. */
  async revocarSesionesDe(usuarioId: string, motivo: MotivoRevocacion): Promise<void> {
    await this.sesiones.revocarTodasDe(usuarioId, motivo);
  }

  /** Crea la fila de sesion con un token nuevo y devuelve lo que va en las cookies. */
  private async abrirSesion(usuarioId: string, ip: string | null, agente: string | null): Promise<SesionCreada> {
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const expiraEn = new Date(Date.now() + this.horasAbsolutas() * 3600_000);

    await this.sesiones.crear({
      tokenHash: this.hashDeToken(token),
      usuarioId,
      csrfToken,
      expiraEn,
      ip,
      agenteUsuario: agente,
    });
    return { token, csrfToken, expiraEn };
  }

  /**
   * Crea la credencial de acceso de un usuario ya existente.
   * Vive aqui y no en usuarios porque es donde esta argon2: la clave en claro no sale de
   * este modulo, no se registra en log y no vuelve en ninguna respuesta.
   */
  async crearCredencial(usuarioId: string, correo: string, password: string, gestor?: EntityManager): Promise<void> {
    await this.credenciales.crear({ usuarioId, correo, passwordHash: await hash(password) }, gestor);
  }

  /** Compara la contrasena con el hash guardado, tardando lo mismo aunque el correo no exista. */
  private async verificarPassword(credencial: Credencial | null, password: string): Promise<boolean> {
    const hashAComparar = credencial ? credencial.passwordHash : await this.obtenerHashDeDescarte();
    return verify(hashAComparar, password).catch(() => false);
  }

  /** Produce una sola vez el hash contra el que se verifican los correos inexistentes. */
  private async obtenerHashDeDescarte(): Promise<string> {
    if (!this.hashDeDescarte) {
      this.hashDeDescarte = await hash(randomBytes(32).toString('hex'));
    }
    return this.hashDeDescarte;
  }

  /** Cuenta el fallo y bloquea la cuenta si ya lleva demasiados seguidos. */
  private async registrarFallo(credencial: Credencial): Promise<void> {
    const fallos = await this.credenciales.sumarIntentoFallido(credencial.usuarioId);
    if (fallos >= FALLOS_PARA_BLOQUEO) {
      const hasta = new Date(Date.now() + MINUTOS_DE_BLOQUEO * 60_000);
      await this.credenciales.bloquearHasta(credencial.usuarioId, hasta);
    }
  }

  /** Rechaza el acceso mientras dure el bloqueo por intentos fallidos. */
  private exigirCuentaDesbloqueada(credencial: Credencial): void {
    if (credencial.bloqueadoHasta && credencial.bloqueadoHasta > new Date()) {
      throw new ExcepcionDominio('CREDENCIALES_INVALIDAS', 'El correo o la contrasena no son correctos.');
    }
  }

  /** Rechaza el acceso de un usuario dado de baja. */
  private exigirUsuarioActivo(credencial: Credencial): void {
    if (!credencial.usuario.activo) {
      throw new ExcepcionDominio('USUARIO_INACTIVO', 'El usuario esta inactivo.');
    }
  }

  /** Revoca y rechaza la sesion si paso el tope absoluto o el de inactividad. */
  private async exigirSesionVigente(sesion: Sesion): Promise<void> {
    const ahora = Date.now();
    const limitePorInactividad = sesion.ultimoAcceso.getTime() + this.minutosInactividad() * 60_000;

    if (sesion.expiraEn.getTime() <= ahora || limitePorInactividad <= ahora) {
      await this.sesiones.revocar(sesion.tokenHash, MotivoRevocacion.EXPIRACION);
      throw new ExcepcionDominio('SESION_EXPIRADA', 'La sesion vencio. Vuelva a iniciar sesion.');
    }
  }

  /** Actualiza ultimoAcceso como maximo una vez por minuto. */
  private async refrescarUltimoAcceso(sesion: Sesion): Promise<void> {
    const ahora = new Date();
    const segundosDesdeElUltimo = (ahora.getTime() - sesion.ultimoAcceso.getTime()) / 1000;
    if (segundosDesdeElUltimo >= SEGUNDOS_ENTRE_REFRESCOS) {
      await this.sesiones.tocarUltimoAcceso(sesion.tokenHash, ahora);
    }
  }

  /** Hash SHA-256 del token: la tabla nunca guarda el valor que viaja al navegador. */
  private hashDeToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Minutos sin actividad tras los que la sesion vence. */
  private minutosInactividad(): number {
    return Number(this.config.get('SESSION_INACTIVIDAD_MIN'));
  }

  /** Horas desde la creacion tras las que la sesion vence sin prorroga. */
  private horasAbsolutas(): number {
    return Number(this.config.get('SESSION_ABSOLUTA_HORAS'));
  }
}
