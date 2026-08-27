import { ChatOpenAI } from '@langchain/openai';
import type { AgentState, RetrievalDoc } from '../state';
import { ToolMessage } from '@langchain/core/messages';
import type { Tool } from '@langchain/core/tools';

export const createGeneratorNode = (
  model: ChatOpenAI,
  tools: Tool[],
  getPersonaPrompt: (name: string) => string,
) => {
  return async (state: AgentState): Promise<Partial<AgentState> & { stream?: any }> => {
    const personaPrompt = getPersonaPrompt(state.persona);

    // 聚合所有检索到的文档
    const allDocs: RetrievalDoc[] = state.retrieved_documents.flatMap(d => d.docs);

    const context = allDocs
      .map((doc, i) =>
        `[片段${i + 1}]\n书名：${doc.book_name}\n章节：第 ${doc.chapter_num} 章\n内容：${doc.content}`
      )
      .join('\n\n');

    const critiqueInfo = state.critique
      ? `\n评估信心指数: ${state.critique.confidence}\n缺失方面: ${(state.critique.missing_aspects && state.critique.missing_aspects.join(', ')) || '无'}`
      : '';

    const prompt = `${personaPrompt}

【检索到的上下文】
${context || '（未检索到相关片段，将基于自身知识回答）'}

【批判性评估结果】
${critiqueInfo}

【用户问题】
${state.query}

请基于以上信息和你的角色设定回答用户问题。`;

    try {
      // 无工具场景直接流式生成，避免额外的一次 invoke 往返
      if (!tools || tools.length === 0) {
        const stream = await model.stream(prompt);
        return {
          stream,
          final_response: '',
          references: allDocs,
          next_action: 'done' as const,
        };
      }

      // 检查是否需要调用工具（如邮件发送等）
      const modelWithTools = model.bindTools(tools);
      const messages = [{ role: 'user' as const, content: prompt }];
      const response = await modelWithTools.invoke(messages);

      if (response.tool_calls && response.tool_calls.length > 0) {
        // 有工具调用
        const toolMessages: ToolMessage[] = [];

        for (const toolCall of response.tool_calls) {
          const tool = tools.find(t => t.name === toolCall.name);
          if (tool) {
            try {
              const toolResult = await tool.invoke(toolCall.args as any);
              toolMessages.push(
                new ToolMessage({
                  content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
                  tool_call_id: toolCall.id || '',
                })
              );
            } catch (err: any) {
              toolMessages.push(
                new ToolMessage({
                  content: `Error: ${err.message}`,
                  tool_call_id: toolCall.id || '',
                })
              );
            }
          }
        }

        // 继续生成（传入工具结果）
        const finalResponse = await model.stream([...messages, response, ...toolMessages]);

        return {
          stream: finalResponse,
          final_response: '',
          references: allDocs,
          next_action: 'done' as const,
        };
      } else {
        // 如果没有工具调用，检查是否是普通字符串回复，或者是返回的带内容的AIMessage
        if (response.content) {
            const contentStr = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
            if (contentStr.trim().length > 0) {
              return {
                final_response: contentStr,
                references: allDocs,
                next_action: 'done' as const,
              };
            }
        }
        
        // 当模型同时返回 content (可能为空字符串) 和 tool_calls，上面判断可能会放过空字符串。
        // 若确保无 tool_calls 才执行此，实际上前文 `if (response.tool_calls...` 已经处理了有工具调用的情况。

        // 无工具调用，为了保证支持流式，重新发起流式请求
        const stream = await model.stream(prompt);

        return {
          stream,
          final_response: '',
          references: allDocs,
          next_action: 'done' as const,
        };
      }
    } catch (error: any) {
      return {
        final_response: `生成回答时出错: ${error.message}`,
        references: allDocs,
        next_action: 'done' as const,
      };
    }
  };
};
