import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, Unique } from 'typeorm';
import { Usuario } from './usuario.entidad';

/** Relacion 1:1 opcional con Usuarios: la PK es tambien la FK, y eso fuerza la cardinalidad. */
@Entity('Credenciales')
@Unique('UQ_Credenciales_Correo', ['correo'])
export class Credencial {
  @PrimaryColumn({ name: 'usuario_id', type: 'uniqueidentifier', primaryKeyConstraintName: 'PK_Credenciales' })
  usuarioId: string;

  @OneToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id', foreignKeyConstraintName: 'FK_Credenciales_Usuario' })
  usuario: Usuario;

  @Column({ name: 'correo', type: 'varchar', length: 254 })
  correo: string;

  /** Hash argon2id con sus parametros. La clave en claro no se persiste nunca. */
  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ name: 'intentos_fallidos', type: 'int', default: () => '0' })
  intentosFallidos: number;

  @Column({ name: 'bloqueado_hasta', type: 'datetime2', precision: 3, nullable: true })
  bloqueadoHasta: Date | null;

  @Column({ name: 'creado_en', type: 'datetime2', precision: 3, default: () => 'SYSUTCDATETIME()' })
  creadoEn: Date;

  @Column({ name: 'actualizado_en', type: 'datetime2', precision: 3, default: () => 'SYSUTCDATETIME()' })
  actualizadoEn: Date;
}
