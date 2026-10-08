import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { withTimeout } from '../common/promise-timeout';
import {
  ExternalResearchService,
  type ExternalSource,
} from './external-research.service';
import type { ExternalResearchContext } from './book-context.service';
import {
  createTavilySearchTool,
  parseTavilySearchInput,
  TAVILY_SEARCH_TOOL_NAME,
} from './tools/tavily-search.tool';
export interface ExternalResearchAgentResult {
  context: ExternalResearchContext;
  messages: BaseMessage[];
}
@Injectable()
export class BookExternalResearchAgentService {
  private readonly logger = new Logger(BookExternalResearchAgentService.name);
  private readonly toolModel: ChatOpenAI;
  private readonly modelRequestTimeoutMs: number;
  constructor(
    private readonly externalResearch: ExternalResearchService,
    config: ConfigService,
  ) {
    this.modelRequestTimeoutMs =
      config.get<number>('openai.requestTimeoutMs') || 20000;
    this.toolModel = new ChatOpenAI({
      apiKey: config.get<string>('openai.apiKey'),
      model: config.get<string>('openai.chatModel') || 'gpt-3.5-turbo',
      configuration: { baseURL: config.get<string>('openai.baseUrl') },
      timeout: this.modelRequestTimeoutMs,
      temperature: 0,
      maxRetries: 0,
    });
  }
  async research(
    bookTitle: string,
    query: string,
    abortSignal?: AbortSignal,
    client?: ChatOpenAI,
  ): Promise<ExternalResearchAgentResult> {
    const decisionInput = new HumanMessage(`<book_title>
${this.escapeXml(bookTitle)}
</book_title>
<user_question>
${this.escapeXml(query)}
</user_question>`);
    const searchTool = createTavilySearchTool(({ query: searchQuery }) =>
      this.externalResearch.search(searchQuery, abortSignal),
    );

    let response: AIMessage;
    try {
      response = await this.withExternalRoutingDeadline(
        (signal) =>
          (client ?? this.toolModel)
            .bindTools([searchTool], {
              tool_choice: 'auto',
              parallel_tool_calls: false,
            })
            .invoke(
              [
                new SystemMessage(`<external_research_router>
你只负责判断当前问题是否需要一次现实世界联网搜索，不要回答问题。
只有作者信息、历史文化典故、现实背景、时效性事实或用户明确要求联网查证时，才调用 tavily_search。
小说人物、情节、设定、伏笔、结局、原文解释和普通阅读讨论不得联网，必须交给后续书内检索。
搜索词只能依据当前 book_title 与 user_question 生成，保持简洁；不得猜测或添加小说原文、用户记忆、历史消息、账号信息。
每轮最多调用一次工具；不需要联网时不要调用任何工具。
</external_research_router>`),
                decisionInput,
              ],
              { signal },
            ),
        abortSignal,
      );
    } catch (error) {
      if (abortSignal?.aborted) throw error;
      this.logger.warn(
        `External research routing failed (type=${this.errorName(error)})`,
      );
      return {
        context: {
          requested: true,
          used: false,
          sources: [],
          failed: true,
        },
        messages: [],
      };
    }

    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return {
        context: {
          requested: true,
          used: false,
          sources: [],
          failed: false,
        },
        messages: [],
      };
    }

    const toolCall = toolCalls[0];
    if (
      toolCalls.length !== 1 ||
      toolCall.name !== TAVILY_SEARCH_TOOL_NAME ||
      typeof toolCall.id !== 'string' ||
      !toolCall.id
    ) {
      this.logger.warn(
        'External research routing returned an invalid tool call',
      );
      return {
        context: {
          requested: true,
          used: false,
          sources: [],
          failed: true,
        },
        messages: [],
      };
    }

    try {
      const input = parseTavilySearchInput(toolCall.args);
      const result: unknown = await searchTool.invoke(input, {
        signal: abortSignal,
      });
      if (!this.isExternalSources(result)) {
        throw new Error('External research tool returned invalid sources');
      }
      const toolMessage = new ToolMessage({
        content: JSON.stringify({ sources: result }),
        tool_call_id: toolCall.id,
        name: TAVILY_SEARCH_TOOL_NAME,
      });
      return {
        context: {
          requested: true,
          used: true,
          sources: result,
          failed: false,
        },
        messages: [decisionInput, response, toolMessage],
      };
    } catch (error) {
      if (abortSignal?.aborted || this.isAbortError(error)) throw error;
      this.logger.warn(
        `External research tool failed (type=${this.errorName(error)})`,
      );
      const toolMessage = new ToolMessage({
        content: JSON.stringify({ error: 'external_search_unavailable' }),
        tool_call_id: toolCall.id,
        name: TAVILY_SEARCH_TOOL_NAME,
      });
      return {
        context: {
          requested: true,
          used: true,
          sources: [],
          failed: true,
        },
        messages: [decisionInput, response, toolMessage],
      };
    }
  }

  private isExternalSources(value: unknown): value is ExternalSource[] {
    return (
      Array.isArray(value) &&
      value.every(
        (source) =>
          source &&
          typeof source === 'object' &&
          'title' in source &&
          typeof source.title === 'string' &&
          'url' in source &&
          typeof source.url === 'string' &&
          'snippet' in source &&
          typeof source.snippet === 'string',
      )
    );
  }

  private extractText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (
          part &&
          typeof part === 'object' &&
          'text' in part &&
          typeof part.text === 'string'
        ) {
          return part.text;
        }
        return '';
      })
      .join('');
  }

  private escapeXml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
  }

  private errorName(error: unknown): string {
    return error instanceof Error && error.name ? error.name : 'UnknownError';
  }

  private async withExternalRoutingDeadline<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    abortSignal?: AbortSignal,
  ): Promise<T> {
    const timeoutController = new AbortController();
    const signal = abortSignal
      ? AbortSignal.any([abortSignal, timeoutController.signal])
      : timeoutController.signal;
    const timer = setTimeout(
      () => timeoutController.abort(),
      this.modelRequestTimeoutMs,
    );
    try {
      return await withTimeout(
        operation(signal),
        this.modelRequestTimeoutMs,
        'external research routing',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
