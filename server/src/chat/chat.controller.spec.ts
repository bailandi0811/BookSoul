import { ConflictException, HttpException, Logger } from '@nestjs/common';
import { AgentRunStatus } from '@prisma/client';
import { EventEmitter } from 'events';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth-context';
import { AgentAdmissionService } from './admission/agent-admission.service';
import { BookChatService } from './book-chat.service';
import {
  BookSessionsService,
  type BookChatContext,
} from './book-sessions.service';
import { ChatController } from './chat.controller';
import { DeepBookError } from './deep-book.types';

describe('ChatController admission', () => {
  const context: BookChatContext = {
    ownerId: 'user-a',
    sessionId: 'session-a',
    assistantId: 'assistant-a',
    bookId: 'book-a',
    bookTitle: '测试小说',
    assistantName: '书魂',
    responseDepth: 'BALANCED',
    tone: 'NATURAL',
    customInstruction: null,
    boundary: {
      ownerScope: 'user-a',
      bookId: 'book-a',
      embeddingVersion: 'v1',
      spoilerCeiling: 2,
    },
  };
  const auth: AuthContext = {
    kind: 'user',
    userId: 'user-a',
    email: 'reader@example.com',
    name: 'Reader',
  };
  const body = {
    sessionId: 'session-a',
    message: '谁出现了？',
    spoilerOverride: false,
    externalResearch: false,
  };

  let chatService: { stream: jest.Mock };
  let sessions: { resolve: jest.Mock };
  let admission: { acquire: jest.Mock };
  let controller: ChatController;

  beforeEach(() => {
    chatService = { stream: jest.fn() };
    sessions = { resolve: jest.fn().mockResolvedValue(context) };
    admission = { acquire: jest.fn() };
    controller = new ChatController(
      chatService as unknown as BookChatService,
      sessions as unknown as BookSessionsService,
      admission as unknown as AgentAdmissionService,
    );
  });

  it('accepts deep external research and mail intent with trusted options', async () => {
    admission.acquire.mockResolvedValue({
      accepted: true,
      lease: acceptedLease(),
    });
    chatService.stream.mockImplementation(async function* () {
      yield { type: 'content', data: 'answer' };
    });
    for (const message of ['作者背景', '发邮件给我的邮箱']) {
      await controller.chat(
        { ...body, message, retrievalMode: 'deep', externalResearch: true },
        response() as unknown as Response,
        auth,
      );
      expect(chatService.stream).toHaveBeenLastCalledWith(
        context,
        message,
        expect.objectContaining({
          retrievalMode: 'deep',
          externalResearch: true,
          accountEmail: auth.email,
        }),
      );
    }
  });
  it('rejects invalid mode before acquiring a lease', async () => {
    await expect(
      controller.chat(
        { ...body, retrievalMode: 'invalid' as 'deep' },
        response() as unknown as Response,
        auth,
      ),
    ).rejects.toThrow();
    expect(admission.acquire).not.toHaveBeenCalled();
  });

  function response() {
    const emitter = new EventEmitter() as EventEmitter & {
      writableEnded: boolean;
      destroyed: boolean;
      setHeader: jest.Mock;
      write: jest.Mock;
      end: jest.Mock;
    };
    emitter.writableEnded = false;
    emitter.destroyed = false;
    emitter.setHeader = jest.fn();
    emitter.write = jest.fn();
    emitter.end = jest.fn(() => {
      emitter.writableEnded = true;
    });
    return emitter;
  }

  function acceptedLease() {
    return {
      runId: 'run-a',
      hasLostLease: jest.fn().mockReturnValue(false),
      finish: jest.fn().mockResolvedValue(undefined),
    };
  }

  it('returns 409 before opening SSE when the session is already running', async () => {
    admission.acquire.mockResolvedValue({
      accepted: false,
      reason: 'SESSION_BUSY',
      retryAfterSeconds: 5,
    });
    const res = response();

    await expect(
      controller.chat(body, res as unknown as Response, auth),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(res.setHeader).not.toHaveBeenCalledWith(
      'Content-Type',
      'text/event-stream',
    );
    expect(res.listenerCount('close')).toBe(0);
  });

  it('returns a bounded 429 with Retry-After at the user limit', async () => {
    admission.acquire.mockResolvedValue({
      accepted: false,
      reason: 'USER_LIMIT',
      retryAfterSeconds: 5,
    });
    const res = response();

    let thrown: unknown;
    try {
      await controller.chat(body, res as unknown as Response, auth);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getStatus()).toBe(429);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '5');
  });

  it('streams an accepted run and records successful completion', async () => {
    const lease = acceptedLease();
    admission.acquire.mockResolvedValue({ accepted: true, lease });
    chatService.stream.mockImplementation(async function* () {
      yield { type: 'content', data: '回答' };
    });
    const res = response();

    await controller.chat(body, res as unknown as Response, auth);

    expect(res.write).toHaveBeenCalledWith(
      `data: ${JSON.stringify({ content: '回答' })}\n\n`,
    );
    expect(res.write).toHaveBeenCalledWith('data: [DONE]\n\n');
    expect(lease.finish).toHaveBeenCalledWith(AgentRunStatus.SUCCEEDED);
  });
  it('logs a safe failure reason while preserving the public error contract', async () => {
    const lease = acceptedLease();
    admission.acquire.mockResolvedValue({ accepted: true, lease });
    chatService.stream.mockImplementation(async function* () {
      yield { type: 'thinking', data: '正在拆解问题' };
      throw new DeepBookError('DEEP_MODE_OUTPUT_INVALID', {
        stage: 'plan',
        reason: 'json_invalid',
      });
    });
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      const res = response();
      await controller.chat(
        {
          ...body,
          message: 'synthetic-private-question',
          retrievalMode: 'deep',
        },
        res as unknown as Response,
        auth,
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('stage=plan, reason=json_invalid'),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        'synthetic-private-question',
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(context.ownerId);
      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining('"code":"DEEP_MODE_OUTPUT_INVALID"'),
      );
      expect(res.write).not.toHaveBeenCalledWith('data: [DONE]\n\n');
      expect(lease.finish).toHaveBeenCalledWith(AgentRunStatus.FAILED);
    } finally {
      log.mockRestore();
    }
  });

  it('sends wait heartbeats and clears timers after one deep terminal event', async () => {
    jest.useFakeTimers();
    try {
      const lease = acceptedLease();
      admission.acquire.mockResolvedValue({ accepted: true, lease });
      let finish: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        finish = resolve;
      });
      chatService.stream.mockImplementation(async function* () {
        await gate;
        yield { type: 'content', data: 'answer' };
      });
      const res = response();
      const running = controller.chat(
        { ...body, retrievalMode: 'deep' },
        res as unknown as Response,
        auth,
      );
      await jest.advanceTimersByTimeAsync(10000);
      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining('正在等待本轮处理完成'),
      );
      finish();
      await running;
      expect(lease.finish).toHaveBeenCalledTimes(1);
      expect(
        res.write.mock.calls.filter((call) => call[0] === 'data: [DONE]\n\n'),
      ).toHaveLength(1);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels and releases an accepted run when the client disconnects', async () => {
    const lease = acceptedLease();
    admission.acquire.mockResolvedValue({ accepted: true, lease });
    const res = response();
    chatService.stream.mockImplementation(async function* (
      _context: BookChatContext,
      _message: string,
      options: { abortSignal: AbortSignal },
    ) {
      res.destroyed = true;
      res.emit('close');
      expect(options.abortSignal.aborted).toBe(true);
      yield { type: 'thinking', data: 'ignored after disconnect' };
    });

    await controller.chat(body, res as unknown as Response, auth);

    expect(res.write).not.toHaveBeenCalledWith('data: [DONE]\n\n');
    expect(lease.finish).toHaveBeenCalledWith(AgentRunStatus.CANCELLED);
  });
});
