import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { listaSql, MotivoRevocacion } from './enums';
import { Usuario } from './usuario.entidad';

/** Sesion de servidor: la tabla guarda el SHA-256 del token, nunca el token entregado. */
@Entity('Sesiones')
@Index('IX_Sesiones_Usuario', ['usuarioId'], { where: 'revocada_en IS NULL' })
@Index('IX_Sesiones_Expiradas', ['expiraEn'])
@Check('CK_Sesiones_Motivo', `motivo_revocacion IS NULL OR motivo_revocacion IN (${listaSql(MotivoRevocacion)})`)
export class Sesion {
  @PrimaryColumn({ name: 'token_hash', type: 'char', length: 64, primaryKeyConstraintName: 'PK_Sesiones' })
  tokenHash: string;

  @Column({ name: 'usuario_id', type: 'uniqueidentifier' })
  usuarioId: string;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id', foreignKeyConstraintName: 'FK_Sesiones_Usuario' })
  usuario: Usuario;

  /** Segundo valor aleatorio de la sesion; el cliente lo repite en X-CSRF-Token al escribir. */
  @Column({ name: 'csrf_token', type: 'varchar', length: 64 })
  csrfToken: string;

  @Column({ name: 'creada_en', type: 'datetime2', precision: 3, default: () => 'SYSUTCDATETIME()' })
  creadaEn: Date;

  /** Sostiene el vencimiento por inactividad; se refresca como maximo una vez por minuto. */
  @Column({ name: 'ultimo_acceso', type: 'datetime2', precision: 3, default: () => 'SYSUTCDATETIME()' })
  ultimoAcceso: Date;

  /** Vencimiento absoluto: no se prorroga con el uso. */
  @Column({ name: 'expira_en', type: 'datetime2', precision: 3 })
  expiraEn: Date;

  @Column({ name: 'ip', type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Column({ name: 'agente_usuario', type: 'nvarchar', length: 255, nullable: true })
  agenteUsuario: string | null;

  @Column({ name: 'revocada_en', type: 'datetime2', precision: 3, nullable: true })
  revocadaEn: Date | null;

  @Column({ name: 'motivo_revocacion', type: 'varchar', length: 30, nullable: true })
  motivoRevocacion: MotivoRevocacion | null;
}
