import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class ApplicationDrainService implements OnModuleDestroy {
  private draining = false;

  get isDraining(): boolean {
    return this.draining;
  }

  readonly middleware = (
    _request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    if (this.draining) {
      response.status(503).json({ code: 'SERVER_SHUTTING_DOWN' });
      return;
    }
    next();
  };

  onModuleDestroy(): void {
    // Root-module teardown runs before dependency modules start draining.
    this.draining = true;
  }
}
