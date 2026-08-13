// Vibe-coded by Antigravity v2.0 on 2026-08-13. Driven by @dt1900.

import {
  HeyPocketActionItem,
  HeyPocketMindMapNode,
  HeyPocketRecordingData,
  HeyPocketTranscriptSegment,
  HeyPocketWebhookPayload,
  NormalizedPocketNote
} from '../types/heypocket.js';

/**
 * Normalizes any variation of HeyPocket webhook payloads into a unified format.
 */
export function normalizePocketPayload(payload: HeyPocketWebhookPayload): NormalizedPocketNote {
  // Extract recording object (HeyPocket standard is payload.recording or payload.data)
  const recordingObj: Record<string, any> =
    (payload.recording as Record<string, any>) ||
    (payload.data as Record<string, any>) ||
    payload;

  // Extract or generate unique ID
  const rawId =
    recordingObj.id ||
    recordingObj.recording_id ||
    (payload.id as string) ||
    (payload.recording_id as string) ||
    `pocket_${Date.now()}`;
  const id = String(rawId);

  // Extract Title (checks recording.title first)
  const title =
    (recordingObj.title && String(recordingObj.title).trim()) ||
    (recordingObj.name && String(recordingObj.name).trim()) ||
    (payload.title as string) ||
    `Pocket Note - ${new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })}`;

  // Extract Date
  const rawDate =
    recordingObj.createdAt ||
    recordingObj.created_at ||
    recordingObj.recorded_at ||
    payload.timestamp ||
    Date.now();
  let createdAt: Date;
  if (typeof rawDate === 'number') {
    createdAt = new Date(rawDate < 10000000000 ? rawDate * 1000 : rawDate);
  } else {
    createdAt = new Date(rawDate);
    if (isNaN(createdAt.getTime())) {
      createdAt = new Date();
    }
  }

  // Extract Duration (seconds)
  let durationSeconds: number | undefined;
  if (typeof recordingObj.duration === 'number') {
    durationSeconds =
      recordingObj.duration > 1000 ? Math.round(recordingObj.duration / 1000) : recordingObj.duration;
  }

  // Extract Audio URL
  const audioUrl =
    recordingObj.audio_url ||
    recordingObj.recording_url ||
    recordingObj.file_url ||
    undefined;

  // Extract Summary & Summarizations
  let summary: string | undefined;
  const keyTakeaways: string[] = [];
  const actionItems: HeyPocketActionItem[] = [];
  const mindMapPoints: string[] = [];

  // Check summarizations array from HeyPocket
  const summarizations = (payload.summarizations as any[]) || [];
  if (summarizations.length > 0) {
    const primarySummary = summarizations[0];
    if (primarySummary.summary) {
      if (typeof primarySummary.summary === 'string') {
        summary = primarySummary.summary.trim();
      } else if (typeof primarySummary.summary.markdown === 'string') {
        summary = primarySummary.summary.markdown.trim();
      }
    }

    if (Array.isArray(primarySummary.actionItems)) {
      for (const item of primarySummary.actionItems) {
        if (typeof item === 'string' && item.trim()) {
          actionItems.push({ text: item.trim(), completed: false });
        } else if (typeof item === 'object' && item !== null && item.text) {
          actionItems.push({
            id: item.id,
            text: String(item.text).trim(),
            completed: Boolean(item.completed),
            assignee: item.assignee,
            due_date: item.due_date
          });
        }
      }
    }

    if (primarySummary.mindMap) {
      if (Array.isArray(primarySummary.mindMap.nodes)) {
        for (const node of primarySummary.mindMap.nodes) {
          flattenMindMap(node, mindMapPoints);
        }
      } else if (Array.isArray(primarySummary.mindMap)) {
        for (const node of primarySummary.mindMap) {
          if (typeof node === 'string') mindMapPoints.push(node);
          else flattenMindMap(node, mindMapPoints);
        }
      }
    }
  }

  // Fallbacks if not found in summarizations array
  if (!summary) {
    if (typeof recordingObj.summary === 'string') {
      summary = recordingObj.summary.trim();
    } else if (Array.isArray(recordingObj.summary)) {
      summary = recordingObj.summary.join('\n\n');
    }
  }

  if (Array.isArray(recordingObj.key_takeaways)) {
    for (const item of recordingObj.key_takeaways) {
      if (typeof item === 'string' && item.trim()) {
        keyTakeaways.push(item.trim());
      }
    }
  }

  // Fallback Action Items
  if (actionItems.length === 0) {
    const rawActions = recordingObj.action_items || recordingObj.todos || payload.action_items;
    if (Array.isArray(rawActions)) {
      for (const item of rawActions) {
        if (typeof item === 'string' && item.trim()) {
          actionItems.push({ text: item.trim(), completed: false });
        } else if (typeof item === 'object' && item !== null && (item as any).text) {
          const act = item as HeyPocketActionItem;
          actionItems.push({
            id: act.id,
            text: act.text.trim(),
            completed: Boolean(act.completed),
            assignee: act.assignee,
            due_date: act.due_date
          });
        }
      }
    }
  }

  // Extract Transcript & Segments (checks top-level payload.transcript or recordingObj.transcript)
  let transcript = '';
  const transcriptSegments: HeyPocketTranscriptSegment[] = [];

  const rawTranscript = payload.transcript || recordingObj.transcript || recordingObj.transcription;
  if (typeof rawTranscript === 'string') {
    transcript = rawTranscript.trim();
  } else if (Array.isArray(rawTranscript)) {
    for (const item of rawTranscript) {
      if (typeof item === 'string') {
        transcriptSegments.push({ text: item });
        transcript += (transcript ? '\n\n' : '') + item;
      } else if (typeof item === 'object' && item !== null) {
        const seg = item as any;
        const speaker = seg.speaker ? `${seg.speaker}: ` : '';
        const text = seg.text || '';
        transcriptSegments.push({ speaker: seg.speaker, text });
        transcript += (transcript ? '\n' : '') + `${speaker}${text}`;
      }
    }
  }

  // Extract Tags
  const tagsSet = new Set<string>();
  const rawTags = recordingObj.tags || recordingObj.topics || payload.tags;
  if (Array.isArray(rawTags)) {
    for (const tag of rawTags) {
      if (typeof tag === 'string' && tag.trim()) {
        tagsSet.add(tag.trim().replace(/^#/, ''));
      }
    }
  }
  tagsSet.add('Pocket');

  return {
    id,
    title,
    createdAt,
    durationSeconds,
    audioUrl,
    summary,
    keyTakeaways,
    transcript,
    transcriptSegments,
    actionItems,
    tags: Array.from(tagsSet),
    mindMapPoints,
    rawPayload: payload as Record<string, unknown>
  };
}

function flattenMindMap(node: HeyPocketMindMapNode, output: string[], depth = 0): void {
  const indent = '  '.repeat(depth);
  if (node.title) {
    output.push(`${indent}• ${node.title}`);
  }
  if (node.description) {
    output.push(`${indent}  - ${node.description}`);
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      flattenMindMap(child, output, depth + 1);
    }
  }
}
