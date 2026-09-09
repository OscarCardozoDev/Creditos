import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { buildMessage, IsDateString, IsNumber, IsPositive, ValidateBy, ValidationOptions } from 'class-validator';

/** Rechaza una fecha posterior a hoy: un pago no puede quedar registrado en el futuro. */
function NoFechaFutura(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'noFechaFutura',
      validator: {
        validate: (valor: string) => new Date(valor) <= new Date(),
        defaultMessage: buildMessage(() => 'fechaPago no puede ser una fecha futura', validationOptions),
      },
    },
    validationOptions,
  );
}

/** Pago de una cuota concreta del plan. */
export class RegistrarPagoDto {
  @ApiProperty({ example: '2026-10-03', description: 'Dia del calendario, no un instante' })
  @IsDateString({ strict: true })
  @NoFechaFutura()
  fechaPago: string;

  @ApiProperty({ example: 542285.93 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valorPagado: number;
}
