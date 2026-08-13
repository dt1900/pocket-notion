// Vibe-coded by Antigravity v2.0 on 2026-08-13. Driven by @dt1900.

import { handlePocketWebhook } from '../services/sync.js';

export interface LambdaEvent {
  rawPath?: string;
  path?: string;
  httpMethod?: string;
  requestContext?: {
    http?: {
      method?: string;
      path?: string;
    };
  };
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
}

export interface LambdaResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export async function handler(event: LambdaEvent): Promise<LambdaResponse> {
  const method =
    event.requestContext?.http?.method ||
    event.httpMethod ||
    'POST';

  const path =
    event.rawPath ||
    event.path ||
    '/';

  // Health check
  if (method === 'GET' && (path === '/' || path === '/health')) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'ok',
        service: 'pocket-notion-sync-aws',
        timestamp: new Date().toISOString()
      })
    };
  }

  let rawBody = event.body || '{}';
  if (event.isBase64Encoded) {
    rawBody = Buffer.from(rawBody, 'base64').toString('utf-8');
  }

  // Header normalization (case insensitive)
  const headers = event.headers || {};
  const getHeader = (key: string): string | null => {
    const lowerKey = key.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === lowerKey) return v || null;
    }
    return null;
  };

  const signature = getHeader('x-heypocket-signature') || getHeader('x-signature');
  const timestamp = getHeader('x-heypocket-timestamp') || getHeader('x-timestamp');
  const userAgent = getHeader('user-agent') || 'unknown';

  const notionApiKey = process.env.NOTION_API_KEY || '';
  const notionDatabaseId = process.env.NOTION_DATABASE_ID || '';
  const webhookSecret = process.env.HEYPOCKET_WEBHOOK_SECRET || undefined;

  const result = await handlePocketWebhook({
    rawBody,
    signature,
    timestamp,
    config: {
      notionApiKey,
      notionDatabaseId,
      webhookSecret
    }
  });

  // Minimal non-sensitive operational log
  console.log(`[REQUEST] ${method} ${path} | Status: ${result.statusCode}`);

  return {
    statusCode: result.statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result.body)
  };
}
