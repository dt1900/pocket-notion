// Vibe-coded by Antigravity v2.0 on 2026-08-13. Driven by @dt1900.

import { HeyPocketWebhookPayload } from '../types/heypocket.js';
import { normalizePocketPayload } from './normalizer.js';
import { NotionSyncConfig, NotionSyncService, SyncResult } from './notion.js';
import { verifyHeyPocketSignature } from './verifier.js';

export interface WebhookSyncRequest {
  rawBody: string;
  signature?: string | null;
  timestamp?: string | null;
  config: {
    notionApiKey: string;
    notionDatabaseId: string;
    webhookSecret?: string;
  };
}

export interface WebhookSyncResponse {
  statusCode: number;
  body: {
    success: boolean;
    message: string;
    data?: SyncResult;
    error?: string;
  };
}

/**
 * Handles an incoming webhook request from HeyPocket.
 */
export async function handlePocketWebhook(req: WebhookSyncRequest): Promise<WebhookSyncResponse> {
  const { rawBody, signature, timestamp, config } = req;

  // Step 1: Validate Notion configuration
  if (!config.notionApiKey || !config.notionDatabaseId) {
    return {
      statusCode: 500,
      body: {
        success: false,
        message: 'Server misconfiguration',
        error: 'Missing NOTION_API_KEY or NOTION_DATABASE_ID'
      }
    };
  }

  // Step 2: Validate HMAC Signature (if secret is provided)
  if (config.webhookSecret) {
    const verif = await verifyHeyPocketSignature(
      rawBody,
      signature,
      timestamp,
      config.webhookSecret
    );

    if (!verif.isValid) {
      return {
        statusCode: 401,
        body: {
          success: false,
          message: 'Unauthorized webhook request',
          error: verif.reason || 'Invalid HMAC signature'
        }
      };
    }
  }

  // Step 3: Parse JSON payload
  let payload: HeyPocketWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    return {
      statusCode: 400,
      body: {
        success: false,
        message: 'Invalid JSON payload',
        error: err instanceof Error ? err.message : 'JSON parse error'
      }
    };
  }

  // Step 4: Extract event type
  const event = String(payload.event || payload.type || 'recording.created');

  if (event === 'recording.deleted') {
    return {
      statusCode: 200,
      body: {
        success: true,
        message: 'Ignoring recording.deleted event'
      }
    };
  }

  // HeyPocket fires both summary.completed and summary.updated concurrently (1-2s apart).
  // We strictly process only 'summary.completed' to prevent concurrent race-condition duplicates.
  const isFinalSummaryEvent = event === 'summary.completed';
  const isStandAloneTranscription =
    event === 'transcription.completed' &&
    (!payload.summarizations || payload.summarizations.length === 0);

  if (!isFinalSummaryEvent && !isStandAloneTranscription) {
    return {
      statusCode: 200,
      body: {
        success: true,
        message: `Acknowledged ${event} event (skipping to ensure single execution on summary.completed)`
      }
    };
  }

  // Step 5: Normalize Pocket payload
  const normalizedNote = normalizePocketPayload(payload);

  // Step 6: Sync to Notion
  const notionService = new NotionSyncService({
    apiKey: config.notionApiKey,
    databaseId: config.notionDatabaseId
  });

  const syncResult = await notionService.syncNote(normalizedNote);

  if (!syncResult.success) {
    return {
      statusCode: 502,
      body: {
        success: false,
        message: 'Failed to synchronize note to Notion',
        error: syncResult.error
      }
    };
  }

  return {
    statusCode: 200,
    body: {
      success: true,
      message: syncResult.isUpdate
        ? `Successfully updated note "${normalizedNote.title}" in Notion`
        : `Successfully created note "${normalizedNote.title}" in Notion`,
      data: syncResult
    }
  };
}
