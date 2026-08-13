// Vibe-coded by Antigravity v2.0 on 2026-08-13. Driven by @dt1900.

import * as dotenv from 'dotenv';
import * as http from 'http';
import * as https from 'https';

dotenv.config();

const TARGET_URL = process.argv[2] || `http://localhost:${process.env.PORT || '3000'}/webhook`;

const samplePayload = {
  event: 'recording.created',
  timestamp: Date.now(),
  user: {
    id: 'usr_sample_123',
    email: 'user@example.com',
    name: 'Pocket User'
  },
  data: {
    recording_id: `rec_test_${Date.now()}`,
    title: 'Product Strategy & Architecture Review',
    created_at: new Date().toISOString(),
    duration: 185,
    audio_url: 'https://example.com/recordings/audio-sample.m4a',
    summary:
      'The team aligned on building an open-source sync engine between Pocket AI voice notes and Notion. Discussed zero-cost serverless hosting with Cloudflare Workers and AWS Lambda.',
    key_takeaways: [
      'Cloudflare Workers provides 100k free requests per day without idle costs.',
      'AWS Lambda with Function URLs provides a free serverless alternative.',
      'Notion API block chunking is required for long transcripts exceeding 2000 characters.'
    ],
    action_items: [
      { text: 'Deploy Cloudflare Worker to staging', assignee: 'Dan', due_date: 'Tomorrow' },
      { text: 'Configure Notion database sharing permissions', completed: false },
      { text: 'Enter webhook URL into HeyPocket app', completed: false }
    ],
    tags: ['Architecture', 'Notion', 'HeyPocket', 'Serverless'],
    mind_map: [
      'Pocket to Notion Sync Architecture',
      '  • Webhook Ingestion Layer',
      '  • Security & HMAC Verification',
      '  • Notion Page Formatter'
    ],
    transcript: [
      {
        speaker: 'Speaker 1',
        text: 'Hey everyone, let us quickly review how we are bridging voice notes from HeyPocket directly into Notion.'
      },
      {
        speaker: 'Speaker 2',
        text: 'We are using a serverless webhook listener that parses summaries, action items, and transcripts, creating clean Notion database pages.'
      },
      {
        speaker: 'Speaker 1',
        text: 'Perfect. Let us ensure it is completely free to host and open-source for anyone to use.'
      }
    ]
  }
};

async function sendTestWebhook() {
  console.log(`📡 Sending test HeyPocket webhook to: ${TARGET_URL}\n`);

  const rawBody = JSON.stringify(samplePayload, null, 2);
  const timestamp = String(Date.now());
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(rawBody)),
    'User-Agent': 'HeyPocket-Webhook/1.0',
    'X-HeyPocket-Timestamp': timestamp
  };

  const secret = process.env.HEYPOCKET_WEBHOOK_SECRET;
  if (secret) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`));
    const hexSig = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    headers['X-HeyPocket-Signature'] = hexSig;
  }

  const urlObj = new URL(TARGET_URL);
  const isHttps = urlObj.protocol === 'https:';
  const client = isHttps ? https : http;

  const req = client.request(
    TARGET_URL,
    {
      method: 'POST',
      headers
    },
    (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        console.log(`Status Code: ${res.statusCode}`);
        try {
          console.log('Response Body:', JSON.stringify(JSON.parse(body), null, 2));
        } catch {
          console.log('Response Body:', body);
        }
      });
    }
  );

  req.on('error', (err) => {
    console.error('❌ Request error:', err.message);
  });

  req.write(rawBody);
  req.end();
}

sendTestWebhook();
