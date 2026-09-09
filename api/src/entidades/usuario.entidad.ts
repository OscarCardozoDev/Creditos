import { Check, Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { listaSql, TipoPersona, TipoUsuario } from './enums';

@Entity('Usuarios')
@Unique('UQ_Usuarios_Ident', ['identificacion'])
@Check('CK_Usuarios_Rol', `tipo_usuario IN (${listaSql(TipoUsuario)})`)
@Check('CK_Usuarios_Persona', `tipo_persona IN (${listaSql(TipoPersona)})`)
export class Usuario {
  @PrimaryGeneratedColumn('uuid', { name: 'usuario_id', primaryKeyConstraintName: 'PK_Usuarios' })
  usuarioId: string;

  /** VARCHAR y no numerico: admite ceros a la izquierda y digito de verificacion. */
  @Column({ name: 'identificacion', type: 'varchar', length: 20 })
  identificacion: string;

  @Column({ name: 'nombre_razon_social', type: 'nvarchar', length: 150 })
  nombreRazonSocial: string;

  @Column({ name: 'tipo_persona', type: 'varchar', length: 20 })
  tipoPersona: TipoPersona;

  @Column({ name: 'tipo_usuario', type: 'varchar', length: 10 })
  tipoUsuario: TipoUsuario;

  @Column({ name: 'activo', type: 'bit', default: () => '1' })
  activo: boolean;

  @Column({ name: 'creado_en', type: 'datetime2', precision: 3, default: () => 'SYSUTCDATETIME()' })
  creadoEn: Date;

  @Column({ name: 'actualizado_en', type: 'datetime2', precision: 3, default: () => 'SYSUTCDATETIME()' })
  actualizadoEn: Date;
}
