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
    const { message, character } = req.body;
    
    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        console.log(`Received question: ${message}, Character: ${character || 'assistant'}`);
        
        // 1. Retrieve context
        const retrievedContent = await retrieveRelevantContent(message);
        
        let context = '';
        if (retrievedContent.length === 0) {
            console.log('No relevant content found.');
            // Send empty references
            res.write(`data: ${JSON.stringify({ references: [] })}\n\n`);
        } else {
            // Filter low relevance results (simple heuristic, Milvus score logic depends on metric type)
            // Here we just pass all top-k for now, but in a real system we should check scores.
            
            // Send references first
            res.write(`data: ${JSON.stringify({ references: retrievedContent })}\n\n`);
            
            context = retrievedContent.map((item, i) => `
[片段${i+1}]
书名：${item.book_name}
章节：第 ${item.chapter_num} 章
内容：${item.content}
            `).join('\n\n----\n\n');
        }

        // 2. Generate Stream Response
        await generateResponseStream(message, context, res, character);

    } catch (error) {
        console.error('Chat API Error:', error);
        res.write(`data: ${JSON.stringify({ error: 'Internal Server Error' })}\n\n`);
        res.end();
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
