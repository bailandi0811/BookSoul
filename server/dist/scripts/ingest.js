"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("../app.module");
const milvus_service_1 = require("../milvus/milvus.service");
const rag_service_1 = require("../rag/rag.service");
const config_1 = require("@nestjs/config");
const milvus2_sdk_node_1 = require("@zilliz/milvus2-sdk-node");
const epub_1 = require("@langchain/community/document_loaders/fs/epub");
const textsplitters_1 = require("@langchain/textsplitters");
const path_1 = require("path");
async function bootstrap() {
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const milvusService = app.get(milvus_service_1.MilvusService);
    const ragService = app.get(rag_service_1.RagService);
    const configService = app.get(config_1.ConfigService);
    const milvusClient = milvusService.getClient();
    const EPUB_FILE = process.argv[2] || '../天龙八部.epub';
    const CHUNK_SIZE = 500;
    const CHUNK_OVERLAP = 50;
    const BOOK_NAME = (0, path_1.parse)(EPUB_FILE).name;
    const collectionName = configService.get('milvus.collectionName') || 'ebook';
    const vectorDim = configService.get('milvus.vectorDim') || 1024;
    async function ensureBookCollection() {
        try {
            const hasCollection = await milvusClient.hasCollection({
                collection_name: collectionName,
            });
            if (!hasCollection.value) {
                console.log(`${collectionName} 集合不存在， 创建集合...`);
                await milvusClient.createCollection({
                    collection_name: collectionName,
                    fields: [
                        { name: 'id', data_type: milvus2_sdk_node_1.DataType.VarChar, max_length: 100, is_primary_key: true },
                        { name: 'book_id', data_type: milvus2_sdk_node_1.DataType.VarChar, max_length: 100 },
                        { name: 'book_name', data_type: milvus2_sdk_node_1.DataType.VarChar, max_length: 100 },
                        { name: 'chapter_num', data_type: milvus2_sdk_node_1.DataType.Int32 },
                        { name: 'index', data_type: milvus2_sdk_node_1.DataType.Int32 },
                        { name: 'content', data_type: milvus2_sdk_node_1.DataType.VarChar, max_length: 10000 },
                        { name: 'vector', data_type: milvus2_sdk_node_1.DataType.FloatVector, dim: vectorDim },
                    ],
                });
                console.log('集合创建成功');
                await milvusClient.createIndex({
                    collection_name: collectionName,
                    field_name: 'vector',
                    index_type: milvus2_sdk_node_1.IndexType.IVF_FLAT,
                    metric_type: milvus2_sdk_node_1.MetricType.COSINE,
                    params: {
                        nlist: 1024,
                    },
                });
                console.log('索引创建成功');
            }
            try {
                await milvusClient.loadCollection({
                    collection_name: collectionName,
                });
                console.log('集合加载成功');
            }
            catch (err) {
                console.log('集合可能已加载:', err.message);
            }
        }
        catch (err) {
            console.error('创建集合失败:', err);
            throw err;
        }
    }
    async function insertChunksBatch(chunks, bookId, chapterNum) {
        if (chunks.length === 0)
            return 0;
        const data = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            let vector = null;
            let retries = 3;
            while (retries > 0) {
                try {
                    vector = await ragService.getEmbedding(chunk);
                    break;
                }
                catch (err) {
                    console.log(`Embedding failed for chunk ${i}, retrying... (${3 - retries + 1}/3)`);
                    retries--;
                    if (retries === 0) {
                        console.error(`Failed to get embedding for chunk ${i} after 3 attempts.`);
                    }
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                }
            }
            if (vector) {
                data.push({
                    id: `${bookId}_${chapterNum}_${i}`,
                    book_id: String(bookId),
                    book_name: BOOK_NAME,
                    chapter_num: chapterNum,
                    index: i,
                    content: chunk,
                    vector: vector,
                });
            }
        }
        if (data.length > 0) {
            const res = await milvusClient.insert({
                collection_name: collectionName,
                fields_data: data,
            });
            console.log(`Inserted ${res.insert_cnt} chunks for chapter ${chapterNum}`);
            return res.insert_cnt;
        }
        return 0;
    }
    async function ingest() {
        console.log('Starting ingestion process...');
        console.log('Target file:', EPUB_FILE);
        await ensureBookCollection();
        try {
            console.log('Loading EPUB...');
            const loader = new epub_1.EPubLoader(EPUB_FILE);
            const docs = await loader.load();
            console.log(`Loaded ${docs.length} chapters/sections.`);
            const textSplitter = new textsplitters_1.RecursiveCharacterTextSplitter({
                chunkSize: CHUNK_SIZE,
                chunkOverlap: CHUNK_OVERLAP,
            });
            let totalInserted = 0;
            const bookId = 'book_' + Date.now();
            for (let i = 0; i < docs.length; i++) {
                const doc = docs[i];
                if (!doc.pageContent || doc.pageContent.trim().length === 0)
                    continue;
                console.log(`Processing chapter ${i + 1}...`);
                const chunks = await textSplitter.splitText(doc.pageContent);
                const inserted = await insertChunksBatch(chunks, bookId, i + 1);
                totalInserted += Number(inserted);
            }
            console.log(`\nIngestion complete! Total chunks inserted: ${totalInserted}`);
        }
        catch (err) {
            console.error('Ingestion failed:', err);
        }
    }
    await ingest();
    await app.close();
}
bootstrap();
//# sourceMappingURL=ingest.js.map