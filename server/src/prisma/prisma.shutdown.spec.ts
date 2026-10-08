import { Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from './prisma.service';
import { AgentAdmissionStore } from '../chat/admission/agent-admission.store';
import { McpService } from '../mcp/mcp.service';
import { ConfigService } from '@nestjs/config';

jest.mock('@langchain/mcp-adapters', () => ({
  MultiServerMCPClient: class {},
}));

jest.mock('@prisma/client', () => ({
  PrismaClient: class {
    $connect = jest.fn();
    $disconnect = jest.fn().mockResolvedValue(undefined);
  },
}));

describe('database shutdown phases', () => {
  it('keeps the connection open until active worker teardown finishes', async () => {
    const events: string[] = [];
    let release!: () => void;
    const activeTask = new Promise<void>((resolve) => {
      release = resolve;
    });
    const database = new PrismaService();
    jest.spyOn(database, 'onModuleInit').mockResolvedValue(undefined);
    jest.spyOn(database, '$disconnect').mockImplementation(() => {
      events.push('disconnect');
      return Promise.resolve();
    });
    @Injectable()
    class FixtureWorker {
      async onModuleDestroy() {
        events.push('worker-draining');
        await activeTask;
        events.push('worker-finished');
      }
    }
    @Module({
      providers: [
        { provide: PrismaService, useValue: database },
        FixtureWorker,
      ],
    })
    class FixtureModule {}
    const app = await NestFactory.createApplicationContext(FixtureModule, {
      logger: false,
    });
    try {
      const closing = app.close();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(events).toEqual(['worker-draining']);
      release();
      await closing;
      expect(events).toEqual([
        'worker-draining',
        'worker-finished',
        'disconnect',
      ]);
    } finally {
      release();
      await app.close();
      jest.restoreAllMocks();
    }
  });

  it('defers admission and tool transport teardown until application shutdown', () => {
    const config = { get: jest.fn() } as unknown as ConfigService;
    const admission = new AgentAdmissionStore(config);
    const tools = new McpService(config);
    // Closing the module phase is too early: HTTP runs are still draining.
    expect(admission).not.toHaveProperty('onModuleDestroy');
    expect(tools).not.toHaveProperty('onModuleDestroy');
    expect(admission).toHaveProperty('onApplicationShutdown');
    expect(tools).toHaveProperty('onApplicationShutdown');
  });
});
