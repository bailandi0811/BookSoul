import express from 'express';
import cors from 'cors';
import { connectMilvus } from './src/db/milvus.js';
import { retrieveRelevantContent, generateResponseStream } from './src/services/rag.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize DB connection
connectMilvus();

app.get('/', (req, res) => {
    res.send('BookSoul API is running');
});

app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    
    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        console.log(`Received question: ${message}`);
        
        // 1. Retrieve context
        const retrievedContent = await retrieveRelevantContent(message);
        
        let context = '';
        if (retrievedContent.length === 0) {
            console.log('No relevant content found.');
            context = '未找到相关原文片段。请尝试根据通用知识回答，但需说明这可能不在本书范围内。';
        } else {
            context = retrievedContent.map((item, i) => `
[片段${i+1}]
书名：${item.book_name}
章节：第 ${item.chapter_num} 章
内容：${item.content}
            `).join('\n\n----\n\n');
        }

        // 2. Generate Stream Response
        await generateResponseStream(message, context, res);

    } catch (error) {
        console.error('Chat API Error:', error);
        res.write(`data: ${JSON.stringify({ error: 'Internal Server Error' })}\n\n`);
        res.end();
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
