import { ConflictException, HttpException } from '@nestjs/common';
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
