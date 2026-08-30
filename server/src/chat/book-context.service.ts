import { Injectable, Logger } from '@nestjs/common';
import {
  type AgentMemoryContext,
  type BookMemoryContextPolicy,
  MemoryService,
} from '../memory/memory.service';
import { BookChunkRetrieverService } from './book-chunk-retriever.service';
import {
  type BookContextPlan,
  BookContextPlannerService,
} from './book-context-planner.service';
import {
  type BookChatContext,
  BookSessionsService,
} from './book-sessions.service';
import { type ExternalSource } from './external-research.service';

export interface ExternalResearchContext {
  requested: boolean;
  used: boolean;
  sources: ExternalSource[];
  failed: boolean;
}

export interface BookContextBuildOptions {
  externalResearchContext?: ExternalResearchContext;
  abortSignal?: AbortSignal;
}

export interface BookContextBundle {
  plan: BookContextPlan;
  retrieved: Awaited<ReturnType<BookChunkRetrieverService['retrieve']>>;
  memoryContext: AgentMemoryContext;
  externalResearch: ExternalResearchContext;
}

const EMPTY_MEMORY_CONTEXT: AgentMemoryContext = {
  text: '',
  recalledMemoryIds: [],
};

const EMPTY_EXTERNAL_RESEARCH: ExternalResearchContext = {
  requested: false,
  used: false,
  sources: [],
  failed: false,
};

@Injectable()
export class BookContextService {
  private readonly logger = new Logger(BookContextService.name);

  constructor(
    private readonly sessions: BookSessionsService,
    private readonly planner: BookContextPlannerService,
    private readonly retriever: BookChunkRetrieverService,
    private readonly memory: MemoryService,
  ) {}

  async build(
    context: BookChatContext,
    query: string,
    options: BookContextBuildOptions = {},
  ): Promise<BookContextBundle> {
    const abortSignal = options.abortSignal;
    const startedAt = Date.now();
    const recentMessages = await this.sessions.getRecentMessages(
      context.ownerId,
      context.sessionId,
    );
    this.throwIfAborted(abortSignal);

    const plan = await this.planner.plan({
      bookTitle: context.bookTitle,
      query,
      recentMessages,
      abortSignal,
    });
    this.throwIfAborted(abortSignal);

    const [retrieved, memoryContext] = await Promise.all([
      plan.bookQueries.length
        ? this.retriever.retrieve(context.boundary, {
            queries: plan.bookQueries,
            limit: plan.bookLimit,
            maxContextChars: plan.maxBookContextChars,
            maxPerSection: plan.maxChunksPerSection,
          })
        : Promise.resolve([]),
      plan.memoryPolicy !== 'none'
        ? this.buildMemoryContext(
            context,
            plan.memoryQuery,
            plan.memoryLimit,
            plan.memoryPolicy,
            abortSignal,
          )
        : Promise.resolve(EMPTY_MEMORY_CONTEXT),
    ]);
    this.throwIfAborted(abortSignal);
    const externalResearch =
      options.externalResearchContext ?? EMPTY_EXTERNAL_RESEARCH;

    this.logger.debug(
      `Book context assembled planner=${plan.plannerSource}, reason=${plan.reasonCode}, history=${plan.conversationMessages.length}, chunks=${retrieved.length}, memories=${memoryContext.recalledMemoryIds.length}, externalRequested=${externalResearch.requested}, externalSources=${externalResearch.sources.length}, externalFailed=${externalResearch.failed}, chars=${retrieved.reduce((total, item) => total + item.content.length, 0)}, elapsedMs=${Date.now() - startedAt}`,
    );

    return { plan, retrieved, memoryContext, externalResearch };
  }

  private async buildMemoryContext(
    context: BookChatContext,
    query: string,
    topK: number,
    policy: BookMemoryContextPolicy,
    abortSignal?: AbortSignal,
  ): Promise<AgentMemoryContext> {
    try {
      const memoryContext = await this.memory.buildBookAgentContext(
        context.ownerId,
        context.sessionId,
        context.bookId,
        query,
        topK,
        policy,
      );
      this.throwIfAborted(abortSignal);
      return memoryContext;
    } catch (error) {
      if (abortSignal?.aborted || this.isAbortError(error)) throw error;
      this.logger.warn(
        `Book memory recall skipped (type=${this.errorName(error)})`,
      );
      return EMPTY_MEMORY_CONTEXT;
    }
  }

  private throwIfAborted(abortSignal?: AbortSignal): void {
    if (!abortSignal?.aborted) return;
    const error = new Error('Aborted');
    error.name = 'AbortError';
    throw error;
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
  }

  private errorName(error: unknown): string {
    return error instanceof Error && error.name ? error.name : 'UnknownError';
  }
}
