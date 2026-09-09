import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { conContexto } from './contexto-peticion';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  /** Asigna el identificador de la peticion, lo devuelve en X-Request-Id y lo publica en el contexto. */
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);
    conContexto({ requestId }, next);
  }
}
