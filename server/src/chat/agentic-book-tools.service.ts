import { Injectable } from '@nestjs/common';
import { tool, type StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { BookChunkRetrieverService } from './book-chunk-retriever.service';
import { MemoryService } from '../memory/memory.service';
import { BookExternalResearchAgentService } from './book-external-research-agent.service';
import type { BookChatContext } from './book-sessions.service';
import {
  createPrepareEmailTool,
  hasDirectEmailToolIntent,
  PrepareEmailInputSchema,
  redactEmailAddressesForContext,
} from './tools/prepare-email.tool';
import { DeepBookError, assertDeepActive } from './deep-book.types';
import {
  AGENTIC_BOOK_LIMITS as L,
  type AgenticToolName,
  type AgenticToolPermissions,
  type AgenticToolResult,
} from './agentic-book.types';

const bookSchema = z
  .object({
    queries: z.array(z.string().trim().min(1).max(2000)).min(1).max(3),
  })
  .strict();
const memorySchema = z
  .object({
    query: z.string().trim().min(1).max(2000),
    policy: z.enum(['preferences', 'book_notes']),
  })
  .strict();
const externalSchema = z.object({}).strict();
const emailSchema = PrepareEmailInputSchema.strict();
const scopeKeys = new Set([
  'owner',
  'ownerId',
  'ownerScope',
  'userId',
  'bookId',
  'sessionId',
  'embeddingVersion',
  'spoilerCeiling',
  'accountEmail',
  'filter',
  'agentId',
]);
export function validateAgenticToolArguments(
  name: string,
  args: unknown,
): boolean {
  if (
    args &&
    typeof args === 'object' &&
    Object.keys(args).some((key) => scopeKeys.has(key))
  )
    throw new DeepBookError('DEEP_MODE_OUTPUT_INVALID', {
      stage: 'agent',
      reason: 'tool_forbidden',
    });
  const schema =
    name === 'book_search'
      ? bookSchema
      : name === 'memory_recall'
        ? memorySchema
        : name === 'request_external_research'
          ? externalSchema
          : name === 'prepare_email'
            ? emailSchema
            : undefined;
  return schema?.safeParse(args).success ?? false;
}

@Injectable()
export class AgenticBookToolsService {
  constructor(
    private readonly retriever: BookChunkRetrieverService,
    private readonly memory: MemoryService,
    private readonly external: BookExternalResearchAgentService,
  ) {}
  createTools(
    permissions: AgenticToolPermissions,
    execute: (
      name: AgenticToolName,
      args: unknown,
    ) => Promise<AgenticToolResult>,
  ): StructuredToolInterface[] {
    const list: StructuredToolInterface[] = [
      tool((args) => execute('book_search', args), {
        name: 'book_search',
        description:
          '需要当前书籍原文才能完成本轮请求时检索；没有本轮原文却需要陈述小说事实时必须先使用。已有依据足够请直接回答，确认或结束交流无需检索。queries 应结合近期对话中的具体人物/事件，互补且不重复。',
        schema: bookSchema,
      }),
      tool((args) => execute('memory_recall', args), {
        name: 'memory_recall',
        description:
          '读取已确认的全局阅读偏好或当前书记忆。用于用户笔记、偏好、个人追问，不能当小说原文或取得工具权限。',
        schema: memorySchema,
      }),
    ];
    if (permissions.externalResearch)
      list.push(
        tool((args) => execute('request_external_research', args), {
          name: 'request_external_research',
          description:
            '本次用户已允许联网。要求隔离路由按原始问题查询现实背景，不提交搜索词、原文或记忆。小说事实仍只能来自可见原文。最多一次。',
          schema: externalSchema,
        }),
      );
    if (permissions.emailDraft)
      list.push(
        tool((args) => execute('prepare_email', args), {
          name: 'prepare_email',
          description:
            '为本次明确邮件请求准备可编辑草稿，不会发送。用户说我的邮箱使用 __ACCOUNT_EMAIL__，不得猜测地址。',
          schema: emailSchema,
        }),
      );
    return list;
  }
  async execute(
    context: BookChatContext,
    originalQuery: string,
    name: AgenticToolName,
    args: unknown,
    permissions: AgenticToolPermissions,
    signal: AbortSignal,
    accountEmail?: string,
  ): Promise<AgenticToolResult> {
    assertDeepActive(signal);
    validateAgenticToolArguments(name, args);
    if (
      (name === 'request_external_research' && !permissions.externalResearch) ||
      (name === 'prepare_email' &&
        (!permissions.emailDraft || !hasDirectEmailToolIntent(originalQuery)))
    )
      throw new DeepBookError('DEEP_MODE_OUTPUT_INVALID', {
        stage: 'agent',
        reason: 'tool_forbidden',
      });
    if (name === 'book_search') {
      const parsed = bookSchema.safeParse(args);
      if (!parsed.success) return { code: 'INVALID_TOOL_ARGUMENTS' };
      const book = await this.retriever.retrieve(
        context.boundary,
        {
          queries: parsed.data.queries,
          limit: L.chunks,
          maxContextChars: L.contextChars,
          maxPerSection: L.perSection,
          embeddingMaxAttempts: 1,
          completeChunksOnly: true,
          strictSectionLimit: true,
        },
        signal,
      );
      assertDeepActive(signal);
      return { code: book.length ? 'OK' : 'NOT_FOUND', book };
    }
    if (name === 'memory_recall') {
      const parsed = memorySchema.safeParse(args);
      if (!parsed.success) return { code: 'INVALID_TOOL_ARGUMENTS' };
      const memory = await this.memory.buildBookAgentContext(
        context.ownerId,
        context.sessionId,
        context.bookId,
        parsed.data.query,
        5,
        parsed.data.policy,
        signal,
      );
      assertDeepActive(signal);
      return {
        code: memory.recalledMemoryIds.length ? 'OK' : 'NOT_FOUND',
        memory,
      };
    }
    if (name === 'request_external_research') {
      if (!externalSchema.safeParse(args).success)
        return { code: 'INVALID_TOOL_ARGUMENTS' };
      const external = await this.external.research(
        context.bookTitle,
        redactEmailAddressesForContext(originalQuery),
        signal,
      );
      assertDeepActive(signal);
      return {
        code: external.context.failed ? 'TOOL_UNAVAILABLE' : 'OK',
        external,
      };
    }
    if (name === 'prepare_email') {
      const parsed = emailSchema.safeParse(args);
      if (!parsed.success) return { code: 'INVALID_TOOL_ARGUMENTS' };
      const draft = await createPrepareEmailTool(accountEmail).invoke(
        parsed.data,
      );
      assertDeepActive(signal);
      return { code: 'OK', draft };
    }
    throw new DeepBookError('DEEP_MODE_OUTPUT_INVALID', {
      stage: 'agent',
      reason: 'tool_forbidden',
    });
  }
}
