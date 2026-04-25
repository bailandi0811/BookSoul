"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCritiqueNode = exports.createCritiqueAgent = void 0;
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
const createCritiqueAgent = (model) => {
    return async (query, documents) => {
        const docsText = documents
            .map((doc, i) => `[片段${i + 1}]\n书名：${doc.book_name}\n章节：第 ${doc.chapter_num} 章\n内容：${doc.content}`)
            .join('\n\n');
        const response = await model.invoke([
            { role: 'system', content: CRITIQUE_PROMPT },
            { role: 'user', content: `问题: ${query}\n\n文档:\n${docsText}` },
        ]);
        try {
            const result = JSON.parse(response.content);
            return {
                is_adequate: result.is_adequate,
                confidence: result.confidence,
                missing_aspects: result.missing_aspects || [],
                suggested_rewrite: result.suggested_rewrite || '',
                reasoning: result.reasoning || '',
            };
        }
        catch {
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
exports.createCritiqueAgent = createCritiqueAgent;
const createCritiqueNode = (model) => {
    const critiqueAgent = (0, exports.createCritiqueAgent)(model);
    return async (state) => {
        const allDocs = state.retrieved_documents.flatMap(d => d.docs);
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
                next_action: nextRetryCount < state.max_retries ? 'rewrite' : 'generate',
            };
        }
        if (intentType !== 'complex_rag' && allDocs.length >= 1) {
            return {
                critique: {
                    is_adequate: true,
                    confidence: allDocs.length >= 2 ? 0.85 : 0.7,
                    missing_aspects: [],
                    suggested_rewrite: '',
                    reasoning: `Heuristic pass with ${allDocs.length} retrieved doc(s)`,
                },
                next_action: 'generate',
            };
        }
        const critique = await critiqueAgent(state.query, allDocs);
        if (!critique.is_adequate && state.retry_count < state.max_retries) {
            return {
                critique,
                retry_count: state.retry_count + 1,
                next_action: 'rewrite',
            };
        }
        return {
            critique,
            next_action: 'generate',
        };
    };
};
exports.createCritiqueNode = createCritiqueNode;
//# sourceMappingURL=critique.js.map