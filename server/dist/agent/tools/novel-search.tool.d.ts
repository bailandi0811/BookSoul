import { z } from 'zod';
import { MilvusService } from '../../milvus/milvus.service';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
export declare const createNovelSearchTool: (milvusService: MilvusService, configService: ConfigService, embeddings: OpenAIEmbeddings) => import("@langchain/core/tools").DynamicStructuredTool<z.ZodObject<{
    query: z.ZodString;
    top_k: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, z.core.$strip>, {
    query: string;
    top_k: number;
}, {
    query: string;
    top_k?: number | undefined;
}, string, unknown, "novel_search">;
