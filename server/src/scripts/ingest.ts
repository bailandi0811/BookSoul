import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MilvusService } from '../milvus/milvus.service';
import { RagService } from '../rag/rag.service';
import { ConfigService } from '@nestjs/config';
import { DataType, IndexType, MetricType } from '@zilliz/milvus2-sdk-node';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { parse } from 'path';
import EPub from 'epub2';
import { convert } from 'html-to-text';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const milvusService = app.get(MilvusService);
  const ragService = app.get(RagService);
  const configService = app.get(ConfigService);
  const milvusClient = milvusService.getClient();

  const EPUB_FILE = process.argv[2] || '../天龙八部.epub';
  const CHUNK_SIZE = 500;
  const CHUNK_OVERLAP = 50;

  const BOOK_NAME = parse(EPUB_FILE).name;
  const collectionName =
    configService.get<string>('milvus.collectionName') || 'ebook';
  const vectorDim = configService.get<number>('milvus.vectorDim') || 1024;

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
            {
              name: 'id',
              data_type: DataType.VarChar,
              max_length: 100,
              is_primary_key: true,
            },
            { name: 'book_id', data_type: DataType.VarChar, max_length: 100 },
            { name: 'book_name', data_type: DataType.VarChar, max_length: 100 },
            { name: 'chapter_num', data_type: DataType.Int32 },
            { name: 'index', data_type: DataType.Int32 },
            { name: 'content', data_type: DataType.VarChar, max_length: 10000 },
            { name: 'vector', data_type: DataType.FloatVector, dim: vectorDim },
          ],
        });
        console.log('集合创建成功');
        await milvusClient.createIndex({
          collection_name: collectionName,
          field_name: 'vector',
          index_type: IndexType.IVF_FLAT,
          metric_type: MetricType.COSINE,
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
      } catch (err: any) {
        console.log('集合可能已加载:', err.message);
      }
    } catch (err) {
      console.error('创建集合失败:', err);
      throw err;
    }
  }

  async function insertChunksBatch(
    chunks: string[],
    bookId: string,
    chapterNum: number,
  ) {
    if (chunks.length === 0) return 0;

    const data: any[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      let vector: number[] | null = null;
      let retries = 3;
      while (retries > 0) {
        try {
          vector = await ragService.getEmbedding(chunk);
          break;
        } catch {
          console.log(
            `Embedding failed for chunk ${i}, retrying... (${3 - retries + 1}/3)`,
          );
          retries--;
          if (retries === 0) {
            console.error(
              `Failed to get embedding for chunk ${i} after 3 attempts.`,
            );
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
      console.log(
        `Inserted ${res.insert_cnt} chunks for chapter ${chapterNum}`,
      );
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
      const epub = await EPub.createAsync(EPUB_FILE);
      const docs = await Promise.all(
        epub.flow.map(async (chapter) => {
          const html = await epub.getChapterAsync(chapter.id);
          return convert(html, {
            wordwrap: false,
            selectors: [{ selector: 'img', format: 'skip' }],
          });
        }),
      );
      console.log(`Loaded ${docs.length} chapters/sections.`);

      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP,
      });

      let totalInserted = 0;
      const bookId = 'book_' + Date.now();

      for (let i = 0; i < docs.length; i++) {
        const chapterText = docs[i];
        if (!chapterText || chapterText.trim().length === 0) continue;

        console.log(`Processing chapter ${i + 1}...`);
        const chunks = await textSplitter.splitText(chapterText);

        const inserted = await insertChunksBatch(chunks, bookId, i + 1);
        totalInserted += Number(inserted);
      }

      console.log(
        `\nIngestion complete! Total chunks inserted: ${totalInserted}`,
      );
    } catch (err) {
      console.error('Ingestion failed:', err);
    }
  }

  await ingest();
  await app.close();
}

void bootstrap();
