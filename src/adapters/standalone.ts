// Vibe-coded by Antigravity v2.0 on 2026-08-13. Driven by @dt1900.

import * as dotenv from 'dotenv';
import * as http from 'http';
import { handlePocketWebhook } from '../services/sync.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  const url = req.url || '/';

  // Enable JSON response header
  res.setHeader('Content-Type', 'application/json');

  // Health check endpoint
  if (method === 'GET' && (url === '/' || url === '/health')) {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'pocket-notion-sync-standalone',
        timestamp: new Date().toISOString()
      })
    );
    return;
  }

  // Webhook POST endpoint
  if (method === 'POST' && (url === '/' || url === '/webhook')) {
    const chunks: Buffer[] = [];

    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      const rawBody = Buffer.concat(chunks).toString('utf-8');
      const signature =
        (req.headers['x-heypocket-signature'] as string) ||
        (req.headers['x-signature'] as string) ||
        null;
      const timestamp =
        (req.headers['x-heypocket-timestamp'] as string) ||
        (req.headers['x-timestamp'] as string) ||
        null;

      const result = await handlePocketWebhook({
        rawBody,
        signature,
        timestamp,
        config: {
          notionApiKey: process.env.NOTION_API_KEY || '',
          notionDatabaseId: process.env.NOTION_DATABASE_ID || '',
          webhookSecret: process.env.HEYPOCKET_WEBHOOK_SECRET || undefined
        }
      });

      res.writeHead(result.statusCode);
      res.end(JSON.stringify(result.body));
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not Found', message: 'Use POST /webhook or GET /health' }));
});

server.listen(PORT, () => {
  console.log(`🎙️ Pocket to Notion Sync server running on http://localhost:${PORT}`);
  console.log(`📍 Webhook endpoint: http://localhost:${PORT}/webhook`);
});
