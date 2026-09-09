import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Credito } from './credito.entidad';
import { EstadoCuota, listaSql } from './enums';
import { decimalATexto } from './transformadores';

/** Plan de amortizacion persistido. Las filas se generan al aprobar, con la salida del motor. */
@Entity('Cuotas')
@Unique('UQ_Cuotas_Numero', ['creditoId', 'numeroCuota'])
@Index('IX_Cuotas_Pendientes', ['fechaVencimiento'], { where: `estado = '${EstadoCuota.PENDIENTE}'` })
@Check('CK_Cuotas_Estado', `estado IN (${listaSql(EstadoCuota)})`)
@Check('CK_Cuotas_Numero', 'numero_cuota > 0')
@Check('CK_Cuotas_Valor', 'valor_cuota > 0')
@Check(
  'CK_Cuotas_Pago',
  `(estado = '${EstadoCuota.PAGADA}' AND fecha_pago IS NOT NULL AND valor_pagado IS NOT NULL)
   OR (estado <> '${EstadoCuota.PAGADA}' AND fecha_pago IS NULL AND valor_pagado IS NULL)`,
)
export class Cuota {
  @PrimaryGeneratedColumn({ name: 'cuota_id', type: 'bigint', primaryKeyConstraintName: 'PK_Cuotas' })
  cuotaId: string;

  @Column({ name: 'credito_id', type: 'uniqueidentifier' })
  creditoId: string;

  @ManyToOne(() => Credito)
  @JoinColumn({ name: 'credito_id', foreignKeyConstraintName: 'FK_Cuotas_Credito' })
  credito: Credito;

  @Column({ name: 'numero_cuota', type: 'int' })
  numeroCuota: number;

  /** DATE y no DATETIME2: un vencimiento es un dia del calendario, no un instante. */
  @Column({ name: 'fecha_vencimiento', type: 'date' })
  fechaVencimiento: string;

  @Column({ name: 'valor_cuota', type: 'decimal', precision: 18, scale: 2, transformer: decimalATexto })
  valorCuota: string;

  @Column({ name: 'abono_capital', type: 'decimal', precision: 18, scale: 2, transformer: decimalATexto })
  abonoCapital: string;

  @Column({ name: 'abono_interes', type: 'decimal', precision: 18, scale: 2, transformer: decimalATexto })
  abonoInteres: string;

  @Column({ name: 'saldo_posterior', type: 'decimal', precision: 18, scale: 2, transformer: decimalATexto })
  saldoPosterior: string;

  @Column({ name: 'estado', type: 'varchar', length: 12, default: () => `'${EstadoCuota.PENDIENTE}'` })
  estado: EstadoCuota;

  @Column({ name: 'fecha_pago', type: 'date', nullable: true })
  fechaPago: string | null;

  @Column({
    name: 'valor_pagado',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: decimalATexto,
  })
  valorPagado: string | null;
}
