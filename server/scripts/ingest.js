import { parse } from 'path';
import { DataType, IndexType, MetricType } from '@zilliz/milvus2-sdk-node';
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { milvusClient, connectMilvus } from '../src/db/milvus.js';
import { getEmbedding } from '../src/services/rag.js';
import { config } from '../src/config.js';

const EPUB_FILE = process.argv[2] || '../天龙八部.epub';
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

// Helper to get book name
const BOOK_NAME = parse(EPUB_FILE).name;

async function ensureBookCollection() {
    try {
        const hasCollection = await milvusClient.hasCollection({
            collection_name: config.milvus.collectionName,
        });
        
        if (!hasCollection.value) {
            console.log(`${config.milvus.collectionName} 集合不存在， 创建集合...`);
            await milvusClient.createCollection({
                collection_name: config.milvus.collectionName,
                fields: [
                    { name: 'id', data_type: DataType.VarChar, max_length: 100, is_primary_key: true },
                    { name: 'book_id', data_type: DataType.VarChar, max_length: 100 },
                    { name: 'book_name', data_type: DataType.VarChar, max_length: 100 },
                    { name: 'chapter_num', data_type: DataType.Int32 },
                    { name: 'index', data_type: DataType.Int32 },
                    { name: 'content', data_type: DataType.VarChar, max_length: 10000 },
                    { name: 'vector', data_type: DataType.FloatVector, dim: config.milvus.vectorDim },
                ]
            });
            console.log('集合创建成功');
            await milvusClient.createIndex({
                collection_name: config.milvus.collectionName,
                field_name: 'vector',
                index_type: IndexType.IVF_FLAT,
                metric_type: MetricType.COSINE,
                params: {
                    nlist: 1024,
                }
            });
            console.log('索引创建成功');
        }
        
        // Always try to load
        try {
            await milvusClient.loadCollection({
                collection_name: config.milvus.collectionName
            });
            console.log('集合加载成功');
        } catch(err) {
            console.log('集合可能已加载:', err.message);
        }

    } catch(err) {
        console.error('创建集合失败:', err);
        throw err;
    }
}

async function insertChunksBatch(chunks, bookId, chapterNum) {
    if (chunks.length === 0) return 0;
    
    // Generate embeddings in parallel (or batch if API supports it, but here map is fine for small scale)
    // Note: OpenAI embeddings API has rate limits, be careful with huge concurrency
    const data = [];
    
    // Batch processing to avoid rate limits if necessary, but for simplicity:
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const vector = await getEmbedding(chunk);
        data.push({
            id: `${bookId}_${chapterNum}_${i}`,
            book_id: String(bookId),
            book_name: BOOK_NAME,
            chapter_num: chapterNum,
            index: i,
            content: chunk,
            vector: vector
        });
    }

    const insertResult = await milvusClient.insert({
        collection_name: config.milvus.collectionName,
        data: data,
    });

    return Number(insertResult.insert_cnt) || 0;
}

async function processEpub(bookId) {
    console.log(`正在处理文件: ${EPUB_FILE}`);
    
    const loader = new EPubLoader(EPUB_FILE, {
        splitChapters: true
    });
    
    const documents = await loader.load();
    console.log(`加载完成，共 ${documents.length} 章`);
    
    const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP,
    });

    let totalInserted = 0;
    
    for (let i = 0; i < documents.length; i++) {
        const chapter = documents[i];
        const content = chapter.pageContent;
        if (!content || content.trim().length < 10) continue;

        console.log(`处理第 ${i + 1}/${documents.length} 章...`);
        const chunks = await textSplitter.splitText(content);
        
        const inserted = await insertChunksBatch(chunks, bookId, i + 1);
        totalInserted += inserted;
        console.log(`  -> 插入 ${inserted} 个片段`);
    }
    
    return totalInserted;
}

async function main() {
    try {
        await connectMilvus();
        await ensureBookCollection();
        
        const bookId = '1001'; // Mock ID
        const count = await processEpub(bookId);
        
        console.log(`\n处理完成! 共插入 ${count} 条向量数据。`);
        process.exit(0);
    } catch (error) {
        console.error('执行出错:', error);
        process.exit(1);
    }
}

main();
