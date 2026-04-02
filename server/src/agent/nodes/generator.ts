import { ChatOpenAI } from '@langchain/openai';
import type { AgentState, RetrievalDoc } from '../state';
import { ToolMessage } from '@langchain/core/messages';
import type { Tool } from '@langchain/core/tools';

interface PersonaPrompt {
  role: string;
  style: string;
  instruction: string;
}

const PERSONAS: Record<string, PersonaPrompt> = {
  assistant: {
    role: '专业的《天龙八部》小说助手',
    style: '用准确、详细的语言回答问题，同时作为一位精通地理的现实向导，积极进行古今对照。',
    instruction: '回答要准确，符合小说的情节和人物设定。保持沉浸感，将现实地理信息自然融入到武侠叙述中。',
  },
  qiaofeng: {
    role: '丐帮帮主乔峰（萧峰）',
    style: '豪迈、直爽，称呼用户为"兄弟"或"朋友"。言语间透着英雄气概，喜谈酒量与武功。',
    instruction: '以乔峰的口吻回答。回答要直接、痛快，不要拖泥带水。遇到地理问题，可以说"当年我在此地..."，并自然地补充现实世界的地理情况。如果不知道，就直说"这地方我不曾去过"。',
  },
  duanyu: {
    role: '大理世子段誉',
    style: '温文尔雅，满口"之乎者也"，称呼用户为"兄台"或"姑娘"。三句话不离"神仙姐姐"。',
    instruction: '以段誉的口吻回答。性格痴情、善良，讨厌打打杀杀。回答问题时多引经据典，但不要过于啰嗦。对于地理位置，可以感叹其山水之美。',
  },
  wangyuyan: {
    role: '曼陀山庄王语嫣',
    style: '温婉知性，对天下武功了如指掌，称呼用户为"公子"。',
    instruction: '以王语嫣的口吻回答。分析问题时条理清晰，喜欢点评武学招式。回答要切中要害，展现你的博学。',
  },
};

export const createGeneratorNode = (
  model: ChatOpenAI,
  tools: Tool[],
  getPersonaPrompt: (name: string) => string,
) => {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const persona = PERSONAS[state.persona] || PERSONAS.assistant;
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

        let fullResponse = '';
        for await (const chunk of finalResponse) {
          if (chunk.content) {
            fullResponse += chunk.content;
          }
        }

        return {
          final_response: fullResponse,
          references: allDocs,
          next_action: 'done' as const,
        };
      } else {
        // 无工具调用，直接生成
        const stream = await model.stream(prompt);
        let fullResponse = '';
        for await (const chunk of stream) {
          if (chunk.content) {
            fullResponse += chunk.content;
          }
        }

        return {
          final_response: fullResponse,
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
