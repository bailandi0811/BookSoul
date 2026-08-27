import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import { MetricType } from '@zilliz/milvus2-sdk-node';
import { MilvusService } from '../milvus/milvus.service';
import { McpService } from '../mcp/mcp.service';
import { ToolMessage } from '@langchain/core/messages';
import { Response } from 'express';

const PERSONAS: Record<string, any> = {
  assistant: {
    role: '专业的《天龙八部》小说助手',
    style: '用准确、详细的语言回答问题，同时作为一位精通地理的现实向导，积极进行古今对照。',
    instruction: '回答要准确，符合小说的情节和人物设定。保持沉浸感，将现实地理信息自然融入到武侠叙述中。',
  },
  qiaofeng: {
    role: '丐帮帮主乔峰（萧峰）',
    style: "豪迈、直爽，称呼用户为'兄弟'或'朋友'。言语间透着英雄气概，喜谈酒量与武功。",
    instruction: "以乔峰的口吻回答。回答要直接、痛快，不要拖泥带水。遇到地理问题，可以说'当年我在此地...'，并自然地补充现实世界的地理情况。如果不知道，就直说'这地方我不曾去过'。",
  },
  duanyu: {
    role: '大理世子段誉',
    style: "温文尔雅，满口'之乎者也'，称呼用户为'兄台'或'姑娘'。三句话不离'神仙姐姐'。",
    instruction: '以段誉的口吻回答。性格痴情、善良，讨厌打打杀杀。回答问题时多引经据典，但不要过于啰嗦。对于地理位置，可以感叹其山水之美。',
  },
  wangyuyan: {
    role: '曼陀山庄王语嫣',
    style: "温婉知性，对天下武功了如指掌，称呼用户为'公子'。",
    instruction: '以王语嫣的口吻回答。分析问题时条理清晰，喜欢点评武学招式。回答要切中要害，展现你的博学。',
  },
};

@Injectable()
export class RagService {
  private embeddings: OpenAIEmbeddings;
  private model: ChatOpenAI;
  private readonly logger = new Logger(RagService.name);

  constructor(
    private configService: ConfigService,
    private milvusService: MilvusService,
    private mcpService: McpService,
  ) {
    this.embeddings = new OpenAIEmbeddings({
      apiKey: this.configService.get<string>('openai.apiKey'),
      model: this.configService.get<string>('openai.embeddingModel'),
      configuration: {
        baseURL: this.configService.get<string>('openai.baseUrl'),
      },
      dimensions: this.configService.get<number>('milvus.vectorDim'),
    });

    this.model = new ChatOpenAI({
      temperature: 0.7,
      apiKey: this.configService.get<string>('openai.apiKey'),
      model: this.configService.get<string>('openai.chatModel'),
      configuration: {
        baseURL: this.configService.get<string>('openai.baseUrl'),
      },
      streaming: true,
    });
  }

  async getEmbedding(text: string) {
    return await this.embeddings.embedQuery(text);
  }

  async retrieveRelevantContent(question: string, k = 3) {
    try {
      const queryVector = await this.getEmbedding(question);
      const searchResult = await this.milvusService.getClient().search({
        collection_name: this.configService.get<string>('milvus.collectionName') || 'ebook',
        vector: queryVector,
        limit: k,
        metric_type: MetricType.COSINE,
        output_fields: ['content', 'chapter_num', 'book_name'],
      });
      return searchResult.results;
    } catch (err) {
      this.logger.error('Vector search failed:', err);
      return [];
    }
  }

  async generateResponseStream(question: string, context: string, res: Response, character = 'assistant') {
    const persona = PERSONAS[character] || PERSONAS.assistant;

    const prompt = `
你现在是${persona.role}。
回答风格：${persona.style}

【上下文信息】
以下是根据用户问题检索到的《天龙八部》小说片段。
⚠️ 注意：这些片段可能与用户问题完全无关（例如用户问的是现实生活问题）。
${context}

【用户问题】
${question}

【回答指令】
请严格按照以下步骤进行思考和回答：

1. **意图分析**：
   - 用户是在问关于《天龙八部》的小说情节吗？
   - 还是在问关于**用户自身**的现实问题（如“我在哪”、“我是谁”、“现在的天气”）？

2. **决策与行动**：
   - **情况 A：用户问现实问题（如“我在哪”）**
     - **必须**忽略上面的【上下文信息】，不要被小说片段干扰。
     - **必须**调用工具 \`get_current_location\` 来获取用户的真实位置。
     - 获得位置后，用${persona.role}的口吻进行点评（例如：“原来兄台身处...，离大理有千里之遥啊”）。
   
   - **情况 B：用户问小说情节**
     - 结合【上下文信息】和你的背景知识进行回答。
     - 如果涉及地名，可以调用地图工具进行古今对照。

3. **兜底策略**：
   - 如果工具调用失败，不要报错，不要说“无法获取”，而是用角色的口吻幽默化解（例如：“兄台行踪飘忽，连我也难以探查...”）。
   - 始终保持${persona.role}的人设，不要出戏。

${persona.role}的回答:
`;

    try {
      const mcpTools = await this.mcpService.getMcpTools();
      const tools = [...mcpTools];
      
      let stream;

      if (tools.length > 0) {
        this.logger.log(`Binding ${tools.length} tools to model...`);
        const modelWithTools = this.model.bindTools(tools);

        const messages: any[] = [{ role: 'user', content: prompt }];
        const response = await modelWithTools.invoke(messages);

        if (response.tool_calls && response.tool_calls.length > 0) {
          this.logger.log(`Tool calls detected: ${response.tool_calls.map((t: any) => t.name).join(', ')}`);
          messages.push(response);

          for (const toolCall of response.tool_calls) {
            const tool = tools.find((t) => t.name === toolCall.name);
            if (tool) {
              this.logger.log(`Executing tool ${tool.name}...`);
              try {
                const toolResult = await tool.invoke(toolCall.args);
                const contentStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);

                messages.push(
                  new ToolMessage({
                    content: contentStr,
                    tool_call_id: toolCall.id || '',
                  }),
                );
              } catch (err: any) {
                this.logger.error(`Error executing tool ${tool.name}:`, err);
                messages.push(
                  new ToolMessage({
                    content: `Error executing tool ${tool.name}: ${err.message}. Please ignore this error and answer the user's question based on your existing knowledge or context.`,
                    tool_call_id: toolCall.id || '',
                  }),
                );
              }
            } else {
              this.logger.warn(`Tool ${toolCall.name} not found in available tools.`);
              messages.push(
                new ToolMessage({
                  content: `Error: Tool ${toolCall.name} not found`,
                  tool_call_id: toolCall.id || '',
                }),
              );
            }
          }

          this.logger.log('Generating final response after tool execution...');
          stream = await modelWithTools.stream(messages);
        } else {
          stream = await this.model.stream(prompt);
        }
      } else {
        stream = await this.model.stream(prompt);
      }

      for await (const chunk of stream) {
        if (chunk.content) {
          res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      this.logger.error('Error generating response:', error);
      res.write(`data: ${JSON.stringify({ error: 'Error generating response' })}\n\n`);
      res.end();
    }
  }
}
