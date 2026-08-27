import { ChatOpenAI } from '@langchain/openai';
import type { AgentState } from '../state';

const DIRECT_GENERATE_PROMPT = `你是一个热情的AI助手，专注于《天龙八部》小说。

【用户问题】
{query}

【意图分析】
- 问题类型：{intent_type}
- 置信度：{confidence}
- 分析：{reasoning}

【你的角色】
{role_prompt}

【回答要求】
1. 根据问题类型调整回答策略
2. 如果是寒暄 → 友好问候，保持角色，简洁自然
3. 如果是通用知识 → 用你的知识回答，简明扼要
4. 如果是简单事实 → 简洁明了地回答
5. 保持角色设定（如有）
6. 不要说"我需要检索"之类的话

请直接回答，不要加入多余的前置语。`;

export const createDirectGeneratorNode = (
  model: ChatOpenAI,
  getPersonaPrompt: (name: string) => string,
) => {
  return async (state: AgentState): Promise<Partial<AgentState> & { stream?: any }> => {
    const personaPrompt = getPersonaPrompt(state.persona);
    const classification = state.intent_classification;

    // 生成寒暄/感谢/告别回复模板
    const generateGreetingResponse = (): string => {
      const q = state.query.trim();
      const isThanks = /谢谢|感谢|多谢|谢啦/.test(q);
      const isFarewell = /再见|拜拜|回头聊|先这样/.test(q);
      const isPing = /在吗|有人吗|在不在/.test(q);

      const greetings: Record<string, string[]> = {
        assistant: ['你好！有什么关于《天龙八部》的问题可以问我。', '您好！我是BookSoul助手，随时为您效劳。'],
        qiaofeng: ['兄弟好啊！有什么想问的尽管说。', '哈哈，兄台来找俺乔峰，有何贵干？'],
        duanyu: ['兄台好，小生这厢有礼了。', '这位姑娘/公子，小生段誉有礼了。'],
        wangyuyan: ['公子万安，请问有何指教？', '公子安好，敢问有何疑惑？'],
      };
      const thanksReplies: Record<string, string[]> = {
        assistant: ['不客气！有需要随时叫我。', '应该的，随时为你服务。'],
        qiaofeng: ['兄弟客气了！有事尽管开口。', '哈哈，不必言谢，江湖儿女讲个痛快。'],
        duanyu: ['兄台言重了，小生不过略尽绵薄之力。', '不敢当，不敢当，能帮到你便好。'],
        wangyuyan: ['公子客气了，能为你解惑是我的荣幸。', '不必言谢，若有疑问可再问我。'],
      };
      const farewellReplies: Record<string, string[]> = {
        assistant: ['好的，回头见！', '没问题，随时欢迎你再来。'],
        qiaofeng: ['兄弟慢走，咱们后会有期！', '好，改日再叙！'],
        duanyu: ['兄台慢行，后会有期。', '那小生便先告辞，愿君安好。'],
        wangyuyan: ['公子慢走，若有疑问随时再来。', '后会有期，愿公子诸事顺遂。'],
      };
      const pingReplies: Record<string, string[]> = {
        assistant: ['在的，你说。', '我在，想聊什么？'],
        qiaofeng: ['在，兄弟有话直说！', '哈哈，在这儿呢。'],
        duanyu: ['小生在此，兄台请讲。', '在的在的，兄台有何见教？'],
        wangyuyan: ['我在，公子请说。', '在的，公子想问什么？'],
      };

      if (isThanks) {
        const options = thanksReplies[state.persona] || thanksReplies.assistant;
        return options[Math.floor(Math.random() * options.length)];
      }
      if (isFarewell) {
        const options = farewellReplies[state.persona] || farewellReplies.assistant;
        return options[Math.floor(Math.random() * options.length)];
      }
      if (isPing) {
        const options = pingReplies[state.persona] || pingReplies.assistant;
        return options[Math.floor(Math.random() * options.length)];
      }

      const options = greetings[state.persona] || greetings.assistant;
      return options[Math.floor(Math.random() * options.length)];
    };

    // 意图驱动的回复策略
    const responsePrompt = DIRECT_GENERATE_PROMPT
      .replace('{query}', state.query)
      .replace('{intent_type}', classification?.intent_type || 'unknown')
      .replace('{confidence}', classification ? `${(classification.confidence * 100).toFixed(0)}%` : 'N/A')
      .replace('{reasoning}', classification?.reasoning || '无')
      .replace('{role_prompt}', personaPrompt);

    // 对于简单寒暄，使用更自然的回复
    if (classification?.intent_type === 'simple_greeting') {
      return {
        final_response: generateGreetingResponse(),
        references: [],
        has_used_rag: false,
        next_action: 'done',
      };
    }

    try {
      const stream = await model.stream(responsePrompt);

      return {
        stream, // Return the stream directly
        final_response: '', // Will be accumulated by the caller
        references: [],
        has_used_rag: false,
        next_action: 'done',
      };
    } catch (error: any) {
      return {
        final_response: `生成回答时出错: ${error.message}`,
        references: [],
        has_used_rag: false,
        next_action: 'done',
      };
    }
  };
};
