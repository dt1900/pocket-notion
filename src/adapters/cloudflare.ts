// Vibe-coded by Antigravity v2.0 on 2026-08-13. Driven by @dt1900.

import { handlePocketWebhook } from '../services/sync.js';

export interface Env {
  NOTION_API_KEY: string;
  NOTION_DATABASE_ID: string;
  HEYPOCKET_WEBHOOK_SECRET?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'pocket-notion-sync',
          timestamp: new Date().toISOString()
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Webhook endpoint
    if (request.method === 'POST') {
      const rawBody = await request.text();
      const signature =
        request.headers.get('x-heypocket-signature') ||
        request.headers.get('x-signature') ||
        null;
      const timestamp =
        request.headers.get('x-heypocket-timestamp') ||
        request.headers.get('x-timestamp') ||
        null;

      const result = await handlePocketWebhook({
        rawBody,
        signature,
        timestamp,
        config: {
          notionApiKey: env.NOTION_API_KEY,
          notionDatabaseId: env.NOTION_DATABASE_ID,
          webhookSecret: env.HEYPOCKET_WEBHOOK_SECRET
        }
      });

      return new Response(JSON.stringify(result.body), {
        status: result.statusCode,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(
      JSON.stringify({
        error: 'Method Not Allowed',
        message: 'Send a POST request with HeyPocket webhook payload or GET /health'
      }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
