"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClassifyNode = void 0;
const GREETING_PATTERNS = [
    '你好', '您好', '嗨', 'hi', 'hello', '嗨嗨', '哈喽', '早上好', '下午好', '晚上好',
    '在吗', '在不在', '有人吗', 'Hi', 'HI', 'Hello', 'HELLO', '嘿', '哟',
    '谢谢', '谢谢你', '感谢', '多谢', '谢啦', '再见', '拜拜',
];
const NOVEL_ENTITY_PATTERNS = [
    '乔峰', '萧峰', '段誉', '虚竹', '王语嫣', '阿朱', '阿紫', '慕容复', '游坦之',
    '天山童姥', '李秋水', '无崖子', '丁春秋', '鸠摩智', '玄慈', '玄苦', '玄难',
    '马夫人', '康敏', '刀白凤', '阮星竹', '秦红棉', '甘宝宝', '钟灵', '木婉清',
    '风波恶', '包不同', '南海鳄神', '叶二娘', '段正淳', '段正明', '保定帝',
    '枯荣大师', '本因', '本观', '本相', '本参', '本尘',
    '降龙十八掌', '打狗棒法', '六脉神剑', '北冥神功', '凌波微步', '天山六阳掌',
    '生死符', '小无相功', '易筋经', '洗髓经', '九阴真经', '九阳真经',
    '斗转星移', '参合指', '化功大法', '吸星大法', '少林七十二绝技',
    '拈花指', '多罗叶指', '无相劫指', '韦陀掌', '罗汉拳', '铁沙掌',
    '大理', '丐帮', '少林', '嵩山', '擂鼓山', '缥缈峰', '灵鹫宫', '燕子坞',
    '曼陀山庄', '参合庄', '无锡', '松鹤楼', '杏子林', '聚贤庄',
    '太湖', '西湖', '燕子矶', '西域', '中原', '辽东', '西夏',
    '丐帮', '大理段氏', '姑苏慕容', '星宿派', '逍遥派', '少林派', '武当派',
    '峨眉派', '华山派', '嵩山派', '衡山派', '恒山派', '泰山派',
];
const GENERAL_KNOWLEDGE_PATTERNS = [
    '什么是', '谁知道', '世界上', '中国的', '人口', '首都', '货币',
    '现在几点', '今天日期', '天气', '温度', '计算', '多少', '怎么算',
];
const COMPLEX_REASONING_PATTERNS = [
    '为什么', '原因', '怎么回事', '区别', '不同', '比较', '关系',
    '前后', '先后', '影响', '分析', '评价', '总结', '第几章', '哪一章',
    '师傅', '师父', '父亲', '母亲', '徒弟',
];
function detectNovelEntities(query) {
    const detected = [];
    for (const pattern of NOVEL_ENTITY_PATTERNS) {
        if (query.includes(pattern)) {
            detected.push(pattern);
        }
    }
    return detected;
}
function classifyByPattern(query) {
    const q = query.trim();
    for (const pattern of GREETING_PATTERNS) {
        if (q === pattern || q.startsWith(pattern + ' ') || q.startsWith(pattern + '，')) {
            return 'simple_greeting';
        }
    }
    for (const pattern of GENERAL_KNOWLEDGE_PATTERNS) {
        if (q.includes(pattern)) {
            return 'general_knowledge';
        }
    }
    const entities = detectNovelEntities(q);
    if (entities.length > 0) {
        if (q.includes('是谁') || q.includes('叫什么') || q.includes('是什么武功') || q.includes('会什么')) {
            return 'simple_fact';
        }
        if (q.includes('和') && (q.includes('有什么不同') || q.includes('区别') || q.includes('比较'))) {
            return 'complex_rag';
        }
        if (q.includes('为什么') || q.includes('怎么回事') || q.includes('原因')) {
            return 'complex_rag';
        }
        if (q.includes('师傅') || q.includes('师父') || q.includes('父亲') || q.includes('父亲')) {
            return 'complex_rag';
        }
        return 'needs_rag';
    }
    return null;
}
function isToolIntent(query) {
    const q = query.toLowerCase();
    const toolKeywords = [
        '发邮件',
        '发送邮件',
        '邮箱',
        '邮件',
        'mail',
        'email',
        'send mail',
        'send email',
    ];
    return toolKeywords.some((k) => q.includes(k));
}
function isComplexReasoningQuestion(query) {
    return COMPLEX_REASONING_PATTERNS.some((k) => query.includes(k));
}
function isSimpleDirectQuestion(query) {
    const q = query.trim();
    if (!q)
        return false;
    if (q.length <= 12)
        return true;
    const simplePatterns = [
        '是什么',
        '是谁',
        '在哪里',
        '在哪',
        '怎么做',
        '如何',
        '能不能',
        '可以吗',
    ];
    if (simplePatterns.some((k) => q.includes(k)))
        return true;
    if (isComplexReasoningQuestion(q))
        return false;
    return q.length <= 18;
}
const INTENT_CLASSIFY_PROMPT = `你是一个问题分类专家，负责判断用户问题是否需要检索《天龙八部》小说数据库。

【用户问题】
{query}

【检测到的小说实体】
{novel_entities}

【任务】
分析问题，决定是否需要RAG（检索增强生成）来回答。

【分类定义】
- simple_greeting: 纯粹寒暄，如"你好"、"嗨"等
- simple_fact: 简单事实型，可以从小说文本直接推断（如"乔峰是谁？"→ 丐帮帮主）
- general_knowledge: 通用知识，LLM自身知识就能回答（如"中国首都"）
- needs_rag: 需要RAG，涉及具体小说内容、情节、人物关系
- complex_rag: 复杂RAG，多跳推理、比较分析、需要多个片段
- unknown: 无法确定类型

【判断规则】
1. 如果问题不涉及《天龙八部》→ general_knowledge
2. 如果问题只是简单问一个人物是谁、武功是什么 → simple_fact
3. 如果问人物关系、情节发展、比较分析 → needs_rag 或 complex_rag
4. 如果是多步推理（如"乔峰父亲的师傅是谁"）→ complex_rag
5. 寒暄 → simple_greeting

【RAG需求评估】
给出你认为需要RAG的概率 (0.0 - 1.0)：
- 0.0 = 完全不需要，LLM直接回答
- 0.3 = 可能不需要，但有小说相关
- 0.7 = 很需要RAG
- 1.0 = 完全需要RAG

【输出格式】
请严格以JSON格式输出，不要包含其他内容：
{
  "intent_type": "simple_greeting|simple_fact|general_knowledge|needs_rag|complex_rag|unknown",
  "confidence": 0.0-1.0,
  "reasoning": "判断理由",
  "rag_likelihood": 0.0-1.0,
  "suggested_action": "direct_generate|rag_flow|hybrid",
  "keywords_matched": ["匹配的关键词列表"],
  "novel_entities_detected": ["检测到的小说实体"]
}`;
const createClassifyNode = (model) => {
    return async (state) => {
        const query = state.query.trim();
        const toolIntent = isToolIntent(query);
        const patternResult = classifyByPattern(query);
        const novelEntities = detectNovelEntities(query);
        if (toolIntent) {
            return {
                intent_classification: {
                    intent_type: 'general_knowledge',
                    confidence: 0.95,
                    reasoning: '检测到邮件发送工具意图，优先进入工具可用的生成节点',
                    rag_likelihood: 0.0,
                    suggested_action: 'hybrid',
                    keywords_matched: ['邮件工具意图'],
                    novel_entities_detected: novelEntities,
                },
                next_action: 'generate',
            };
        }
        if (patternResult === 'simple_greeting' && novelEntities.length === 0) {
            return {
                intent_classification: {
                    intent_type: 'simple_greeting',
                    confidence: 0.95,
                    reasoning: '纯粹的寒暄问候，无小说实体',
                    rag_likelihood: 0.0,
                    suggested_action: 'direct_generate',
                    keywords_matched: [query],
                    novel_entities_detected: [],
                },
                next_action: 'direct_generate',
            };
        }
        if (patternResult === 'general_knowledge' && novelEntities.length === 0) {
            return {
                intent_classification: {
                    intent_type: 'general_knowledge',
                    confidence: 0.9,
                    reasoning: '通用知识问题，无需检索小说数据库',
                    rag_likelihood: 0.1,
                    suggested_action: 'direct_generate',
                    keywords_matched: [query],
                    novel_entities_detected: [],
                },
                next_action: 'direct_generate',
            };
        }
        if (novelEntities.length > 0) {
            const complex = isComplexReasoningQuestion(query) || patternResult === 'complex_rag';
            return {
                intent_classification: {
                    intent_type: complex ? 'complex_rag' : 'needs_rag',
                    confidence: 0.9,
                    reasoning: complex ? '命中小说实体且问题包含复杂推理特征，进入RAG流程' : '命中小说实体，进入RAG流程确保事实准确',
                    rag_likelihood: complex ? 0.95 : 0.85,
                    suggested_action: 'rag_flow',
                    keywords_matched: novelEntities.slice(0, 5),
                    novel_entities_detected: novelEntities,
                },
                next_action: 'rewrite',
            };
        }
        if (isSimpleDirectQuestion(query)) {
            return {
                intent_classification: {
                    intent_type: 'simple_fact',
                    confidence: 0.9,
                    reasoning: '非小说实体且问题简短直接，走快速直答路径',
                    rag_likelihood: 0.0,
                    suggested_action: 'direct_generate',
                    keywords_matched: [],
                    novel_entities_detected: [],
                },
                next_action: 'direct_generate',
            };
        }
        const llmResponse = await model.invoke([
            { role: 'system', content: INTENT_CLASSIFY_PROMPT },
            { role: 'user', content: `query: ${query}\n\nnovel_entities: ${novelEntities.join(', ') || '无'}` },
        ]);
        let classification;
        try {
            classification = JSON.parse(llmResponse.content);
        }
        catch {
            classification = {
                intent_type: novelEntities.length > 0 ? 'needs_rag' : 'general_knowledge',
                confidence: 0.5,
                reasoning: '解析失败，使用默认分类',
                rag_likelihood: novelEntities.length > 0 ? 0.7 : 0.3,
                suggested_action: novelEntities.length > 0 ? 'rag_flow' : 'direct_generate',
                keywords_matched: [],
                novel_entities_detected: novelEntities,
            };
        }
        let nextAction;
        if (classification.suggested_action === 'direct_generate' && classification.confidence >= 0.8) {
            nextAction = 'direct_generate';
        }
        else if (classification.rag_likelihood >= 0.7) {
            nextAction = 'rewrite';
        }
        else if (classification.rag_likelihood >= 0.4) {
            nextAction = 'hybrid_generate';
        }
        else {
            nextAction = 'direct_generate';
        }
        return {
            intent_classification: classification,
            next_action: nextAction,
        };
    };
};
exports.createClassifyNode = createClassifyNode;
//# sourceMappingURL=classify.js.map