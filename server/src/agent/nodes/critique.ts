import { ChatOpenAI } from '@langchain/openai';
import type { AgentState, CritiqueResult, RetrievalDoc } from '../state';

interface CritiqueOutput {
  is_adequate: boolean;
  confidence: number;
  missing_aspects: string[];
  suggested_rewrite: string;
  reasoning: string;
}

const CRITIQUE_PROMPT = `你是一个自我反思专家，负责评估检索结果的质量。

【用户原始问题】
{query}

【检索到的片段】
{documents}

【任务】
评估检索结果是否足够回答用户问题。

评估标准：
1. 相关性：片段与问题的关联程度
2. 完整性：是否覆盖问题的多个方面
3. 准确性：信息是否与《天龙八部》原著一致

【输出格式】
请严格以JSON格式输出，不要包含其他内容：
{
  "is_adequate": true或false,
  "confidence": 0.0-1.0之间的数字,
  "missing_aspects": ["缺失的方面1", "缺失的方面2"],
  "suggested_rewrite": "建议的重新查询（如果不足）",
  "reasoning": "详细的推理过程"
}

判断标准：
- confidence >= 0.6 且 相关片段 >= 1 → is_adequate = true
- 否则 → is_adequate = false`;

export const createCritiqueAgent = (model: ChatOpenAI) => {
  return async (
    query: string,
    documents: RetrievalDoc[],
  ): Promise<CritiqueResult> => {
    const docsText = documents
      .map(
        (doc, i) =>
          `[片段${i + 1}]\n书名：${doc.book_name}\n章节：第 ${doc.chapter_num} 章\n内容：${doc.content}`,
      )
      .join('\n\n');

    const response = await model.invoke([
      { role: 'system', content: CRITIQUE_PROMPT },
      { role: 'user', content: `问题: ${query}\n\n文档:\n${docsText}` },
    ]);

    try {
      const result = JSON.parse(response.content as string) as CritiqueOutput;
      return {
        is_adequate: result.is_adequate,
        confidence: result.confidence,
        missing_aspects: result.missing_aspects || [],
        suggested_rewrite: result.suggested_rewrite || '',
        reasoning: result.reasoning || '',
      };
    } catch {
      // Fallback: assume adequate if parse fails
      return {
        is_adequate: true,
        confidence: 0.5,
        missing_aspects: [],
        suggested_rewrite: '',
        reasoning: 'Parse failed, assuming adequate',
      };
    }
  };
};

export const createCritiqueNode = (model: ChatOpenAI) => {
  const critiqueAgent = createCritiqueAgent(model);

  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const allDocs = state.retrieved_documents.flatMap((d) => d.docs);
    const intentType = state.intent_classification?.intent_type;

    if (allDocs.length === 0) {
      const nextRetryCount = state.retry_count + 1;
      return {
        critique: {
          is_adequate: false,
          confidence: 0,
          missing_aspects: ['没有检索到任何相关片段'],
          suggested_rewrite: state.query,
          reasoning: 'No documents retrieved',
        },
        retry_count: nextRetryCount,
        next_action:
          nextRetryCount < state.max_retries
            ? ('rewrite' as const)
            : ('generate' as const),
      };
    }

    // 快速路径：命中文档后优先走启发式评估，减少一次 LLM 调用延迟
    if (intentType !== 'complex_rag' && allDocs.length >= 1) {
      return {
        critique: {
          is_adequate: true,
          confidence: allDocs.length >= 2 ? 0.85 : 0.7,
          missing_aspects: [],
          suggested_rewrite: '',
          reasoning: `Heuristic pass with ${allDocs.length} retrieved doc(s)`,
        },
        next_action: 'generate' as const,
      };
    }

    const critique = await critiqueAgent(state.query, allDocs);

    if (!critique.is_adequate && state.retry_count < state.max_retries) {
      // 需要重新检索
      return {
        critique,
        retry_count: state.retry_count + 1,
        next_action: 'rewrite' as const,
      };
    }

    return {
      critique,
      next_action: 'generate' as const,
    };
  };
};
