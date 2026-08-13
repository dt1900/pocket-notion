// Vibe-coded by Antigravity v2.0 on 2026-08-13. Driven by @dt1900.

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { NotionSyncService } from '../src/services/notion.js';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

async function main() {
  console.log('\n======================================================');
  console.log('🎙️  Pocket to Notion Sync - Interactive Setup Wizard');
  console.log('======================================================\n');

  console.log('This wizard will configure and verify your Notion integration.\n');

  // 1. Notion API Key
  let currentKey = process.env.NOTION_API_KEY || '';
  const keyPrompt = currentKey
    ? `Notion Integration Secret [current: ${currentKey.substring(0, 10)}...]: `
    : 'Enter your Notion Integration Token (secret_... or ntn_...): ';

  const inputKey = await prompt(keyPrompt);
  const notionApiKey = inputKey || currentKey;

  if (!notionApiKey) {
    console.error('❌ Error: Notion Integration Token is required.');
    rl.close();
    process.exit(1);
  }

  // 2. Notion Database ID
  let currentDb = process.env.NOTION_DATABASE_ID || '';
  const dbPrompt = currentDb
    ? `Notion Database ID [current: ${currentDb}]: `
    : 'Enter your 32-character Notion Database ID (or full database URL): ';

  const inputDb = await prompt(dbPrompt);
  let databaseId = inputDb || currentDb;

  // If user pasted a full Notion URL, extract the ID
  const urlMatch = databaseId.match(/([a-f0-9]{32})/i);
  if (urlMatch) {
    databaseId = urlMatch[1];
  }

  if (!databaseId) {
    console.error('❌ Error: Notion Database ID is required.');
    rl.close();
    process.exit(1);
  }

  // 3. HeyPocket Webhook Secret (optional)
  let currentSecret = process.env.HEYPOCKET_WEBHOOK_SECRET || '';
  const secretPrompt = currentSecret
    ? `HeyPocket Webhook Signing Secret [current: ${currentSecret.substring(0, 6)}...] (press Enter to keep or skip): `
    : 'HeyPocket Webhook Signing Secret (optional, press Enter to skip): ';

  const inputSecret = await prompt(secretPrompt);
  const webhookSecret = inputSecret || currentSecret;

  console.log('\n🔍 Testing connection to Notion database...');
  const notionService = new NotionSyncService({
    apiKey: notionApiKey,
    databaseId: databaseId
  });

  const connectionResult = await notionService.validateConnection();

  if (!connectionResult.valid) {
    console.log('\n❌ Connection Failed!');
    console.log(`Reason: ${connectionResult.error}\n`);
    console.log('💡 Quick Troubleshooting:');
    console.log('  1. In Notion, open your database page.');
    console.log('  2. Click the top-right "..." menu -> "Connect to" / "Connections".');
    console.log('  3. Select your integration name to grant it read/write access.');
    console.log('  4. Ensure your integration token is copied accurately.\n');
  } else {
    console.log(`✅ Connected successfully to Notion database: "${connectionResult.title}"\n`);
  }

  // Save to .env
  const envContent = [
    '# Vibe-coded by Antigravity v2.0 on 2026-08-13. Driven by @dt1900.',
    `NOTION_API_KEY=${notionApiKey}`,
    `NOTION_DATABASE_ID=${databaseId}`,
    webhookSecret ? `HEYPOCKET_WEBHOOK_SECRET=${webhookSecret}` : '# HEYPOCKET_WEBHOOK_SECRET=',
    'PORT=3000'
  ].join('\n');

  const envPath = path.join(process.cwd(), '.env');
  fs.writeFileSync(envPath, envContent, 'utf-8');
  console.log('💾 Configuration successfully written to .env!\n');

  console.log('======================================================');
  console.log('🚀 Next Steps for Hosting & HeyPocket Configuration');
  console.log('======================================================\n');
  console.log('Option A: Free Cloudflare Workers (Recommended)');
  console.log('  1. Run: npx wrangler login');
  console.log('  2. Run: npx wrangler secret put NOTION_API_KEY');
  console.log('  3. Run: npx wrangler secret put NOTION_DATABASE_ID');
  console.log('  4. Run: npx wrangler deploy');
  console.log('  5. Copy your assigned *.workers.dev URL into HeyPocket.\n');

  console.log('Option B: AWS Lambda (Zero Cost under Free Tier)');
  console.log('  1. Run: npm run deploy:aws');
  console.log('  2. Copy the output WebhookUrl into HeyPocket.\n');

  console.log('Option C: Test Locally');
  console.log('  1. Run: npm run dev');
  console.log('  2. In another terminal, run: npm run test:webhook\n');

  rl.close();
}

main().catch((err) => {
  console.error('Fatal setup error:', err);
  rl.close();
  process.exit(1);
});
