import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Credito } from './credito.entidad';
import { EstadoCredito, listaSql } from './enums';
import { Usuario } from './usuario.entidad';

/** Bitacora append-only de transiciones. Solo recibe INSERT: por eso una sola columna de fecha. */
@Entity('HistorialCredito')
@Index('IX_Historial_Credito', ['creditoId', 'fecha'])
@Check('CK_Historial_EstadoAnt', `estado_anterior IS NULL OR estado_anterior IN (${listaSql(EstadoCredito)})`)
@Check('CK_Historial_EstadoNue', `estado_nuevo IN (${listaSql(EstadoCredito)})`)
export class HistorialCredito {
  @PrimaryGeneratedColumn({
    name: 'historial_id',
    type: 'bigint',
    primaryKeyConstraintName: 'PK_HistorialCredito',
  })
  historialId: string;

  @Column({ name: 'credito_id', type: 'uniqueidentifier' })
  creditoId: string;

  @ManyToOne(() => Credito)
  @JoinColumn({
    name: 'credito_id',
    foreignKeyConstraintName: 'FK_Historial_Credito',
  })
  credito: Credito;

  /** Nulo unicamente en la fila de creacion del credito. */
  @Column({
    name: 'estado_anterior',
    type: 'varchar',
    length: 15,
    nullable: true,
  })
  estadoAnterior: EstadoCredito | null;

  @Column({ name: 'estado_nuevo', type: 'varchar', length: 15 })
  estadoNuevo: EstadoCredito;

  @Column({ name: 'usuario_id', type: 'uniqueidentifier', nullable: true })
  usuarioId: string | null;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({
    name: 'usuario_id',
    foreignKeyConstraintName: 'FK_Historial_Usuario',
  })
  usuario: Usuario | null;

  /** Copia del nombre en el momento del hecho: la auditoria no se reescribe al cambiar el usuario. */
  @Column({ name: 'usuario_nombre', type: 'nvarchar', length: 100 })
  usuarioNombre: string;

  @Column({
    name: 'observacion',
    type: 'nvarchar',
    length: 500,
    nullable: true,
  })
  observacion: string | null;

  @Column({
    name: 'fecha',
    type: 'datetime2',
    precision: 3,
    default: () => 'SYSUTCDATETIME()',
  })
  fecha: Date;
}
