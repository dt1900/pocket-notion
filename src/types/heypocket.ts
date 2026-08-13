// Vibe-coded by Antigravity v2.0 on 2026-08-13. Driven by @dt1900.

export type HeyPocketEventType =
  | 'recording.created'
  | 'recording.deleted'
  | 'recording.merged'
  | 'transcript.completed'
  | 'transcript.edited'
  | 'action_items.updated'
  | 'mind_map.completed'
  | 'translation.completed'
  | string;

export interface HeyPocketTranscriptSegment {
  speaker?: string;
  text: string;
  start_time?: number;
  end_time?: number;
}

export interface HeyPocketActionItem {
  id?: string;
  text: string;
  completed?: boolean;
  assignee?: string;
  due_date?: string;
}

export interface HeyPocketMindMapNode {
  title: string;
  children?: HeyPocketMindMapNode[];
  description?: string;
}

export interface HeyPocketRecordingData {
  id?: string;
  recording_id?: string;
  title?: string;
  name?: string;
  created_at?: string | number;
  recorded_at?: string | number;
  duration?: number;
  audio_url?: string;
  recording_url?: string;
  file_url?: string;
  summary?: string | string[];
  key_takeaways?: string[];
  transcript?: string | (string | HeyPocketTranscriptSegment)[];
  transcription?: string | (string | HeyPocketTranscriptSegment)[];
  action_items?: (string | HeyPocketActionItem)[];
  todos?: (string | HeyPocketActionItem)[];
  tags?: string[];
  topics?: string[];
  mind_map?: string | string[] | HeyPocketMindMapNode[];
  user?: {
    id?: string;
    email?: string;
    name?: string;
  };
  organization?: {
    id?: string;
    name?: string;
  };
  [key: string]: unknown;
}

export interface HeyPocketWebhookPayload {
  event?: HeyPocketEventType;
  type?: string;
  data?: HeyPocketRecordingData;
  timestamp?: number;
  user?: {
    id?: string;
    email?: string;
    name?: string;
  };
  organization?: {
    id?: string;
    name?: string;
  };
  // Fallback for flat payloads
  [key: string]: unknown;
}

export interface NormalizedPocketNote {
  id: string;
  title: string;
  createdAt: Date;
  durationSeconds?: number;
  audioUrl?: string;
  summary?: string;
  keyTakeaways: string[];
  transcript: string;
  transcriptSegments: HeyPocketTranscriptSegment[];
  actionItems: HeyPocketActionItem[];
  tags: string[];
  mindMapPoints: string[];
  rawPayload: Record<string, unknown>;
}
