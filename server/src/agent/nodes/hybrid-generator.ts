import { ChatOpenAI } from '@langchain/openai';
import type { AgentState, RetrievalDoc } from '../state';
import { ToolMessage } from '@langchain/core/messages';
import type { Tool } from '@langchain/core/tools';
import { formatScopedUserContext } from '../context';

const HYBRID_GENERATE_PROMPT = `你是一个《天龙八部》小说助手，有部分检索结果可以参考。

【用户问题】
{query}

【部分检索到的上下文】（可能不完整）
{context}

【检索置信度】
{critique_info}

【你的角色】
{role_prompt}

【用户专属上下文】
{user_context}

【任务】
1. 优先使用检索到的片段回答
2. 如果检索结果不足，用你自己的知识补充
3. 诚实告知用户哪些是你检索到的，哪些是你推测的
4. 保持角色设定

请基于以上信息回答用户问题。`;

export const createHybridGeneratorNode = (
  model: ChatOpenAI,
  tools: Tool[],
  getPersonaPrompt: (name: string) => string,
) => {
  return async (
    state: AgentState,
  ): Promise<Partial<AgentState> & { stream?: any }> => {
    const personaPrompt = getPersonaPrompt(state.persona);
    const allDocs: RetrievalDoc[] = state.retrieved_documents.flatMap(
      (d) => d.docs,
    );

    const context =
      allDocs.length > 0
        ? allDocs
            .map(
              (doc, i) =>
                `[片段${i + 1}]\n书名：${doc.book_name}\n章节：第 ${doc.chapter_num} 章\n内容：${doc.content}`,
            )
            .join('\n\n')
        : '（未检索到相关片段）';

    const critiqueInfo = state.critique
      ? `信心指数: ${state.critique.confidence}\n缺失方面: ${state.critique.missing_aspects?.join(', ') || '无'}`
      : '未进行评估';

    const prompt = HYBRID_GENERATE_PROMPT.replace('{query}', state.query)
      .replace('{context}', context)
      .replace('{critique_info}', critiqueInfo)
      .replace('{role_prompt}', personaPrompt)
      .replace('{user_context}', formatScopedUserContext(state));

    // 无工具场景直接流式生成，避免额外的一次 invoke 往返
    if (!tools || tools.length === 0) {
      const stream = await model.stream(prompt);
      return {
        stream,
        final_response: '',
        references: allDocs,
        has_used_rag: allDocs.length > 0,
        next_action: 'done' as const,
      };
    }

    // 检查是否需要调用工具
    const modelWithTools = model.bindTools(tools);
    const messages = [{ role: 'user' as const, content: prompt }];
    const response = await modelWithTools.invoke(messages);

    if (response.tool_calls && response.tool_calls.length > 0) {
      const toolMessages: ToolMessage[] = [];

      for (const toolCall of response.tool_calls) {
        const tool = tools.find((t) => t.name === toolCall.name);
        if (tool) {
          try {
            const toolResult = await tool.invoke(toolCall.args as any);
            toolMessages.push(
              new ToolMessage({
                content:
                  typeof toolResult === 'string'
                    ? toolResult
                    : JSON.stringify(toolResult),
                tool_call_id: toolCall.id || '',
              }),
            );
          } catch (err: any) {
            toolMessages.push(
              new ToolMessage({
                content: `Error: ${err.message}`,
                tool_call_id: toolCall.id || '',
              }),
            );
          }
        }
      }

      const finalResponse = await model.stream([
        ...messages,
        response,
        ...toolMessages,
      ]);

      return {
        stream: finalResponse,
        final_response: '',
        references: allDocs,
        has_used_rag: true,
        next_action: 'done' as const,
      };
    } else {
      if (response.content) {
        const contentStr =
          typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content);
        if (contentStr.trim().length > 0) {
          return {
            final_response: contentStr,
            references: allDocs,
            has_used_rag: allDocs.length > 0,
            next_action: 'done' as const,
          };
        }
      }

      // 无工具调用，为了保证支持流式，重新发起流式请求
      const stream = await model.stream(prompt);

      return {
        stream,
        final_response: '',
        references: allDocs,
        has_used_rag: allDocs.length > 0,
        next_action: 'done' as const,
      };
    }
  };
};
