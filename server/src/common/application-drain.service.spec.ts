import type { NextFunction, Request, Response } from 'express';
import { ApplicationDrainService } from './application-drain.service';

describe('application drain', () => {
  it('accepts requests before shutdown and refuses new work while modules drain', () => {
    const service = new ApplicationDrainService();
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const response = { status } as unknown as Response;
    const next = jest.fn() as NextFunction;
    service.middleware({} as Request, response, next);
    expect(next).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
    service.middleware({} as Request, response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({ code: 'SERVER_SHUTTING_DOWN' });
  });
});
