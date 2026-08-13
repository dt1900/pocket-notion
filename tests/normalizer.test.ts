// Vibe-coded by Antigravity v2.0 on 2026-08-13. Driven by @dt1900.

import { describe, expect, it } from 'vitest';
import { normalizePocketPayload } from '../src/services/normalizer.js';
import { chunkString } from '../src/services/notion.js';

describe('normalizePocketPayload', () => {
  it('should normalize standard nested HeyPocket payload', () => {
    const payload = {
      event: 'recording.created',
      timestamp: 1715000000000,
      data: {
        recording_id: 'rec_abc_123',
        title: 'Team Sync Discussion',
        created_at: '2026-08-13T12:00:00Z',
        duration: 120,
        audio_url: 'https://cdn.heypocket.com/audio/sample.mp3',
        summary: 'Discussion about launching Notion sync engine.',
        key_takeaways: ['Takeaway 1', 'Takeaway 2'],
        action_items: [
          { text: 'Complete code review', completed: false, assignee: 'Dan' },
          'Deploy to production'
        ],
        tags: ['Engineering', 'Launch'],
        transcript: [
          { speaker: 'Dan', text: 'Let us build this integration.' },
          { speaker: 'Alex', text: 'Sounds great!' }
        ]
      }
    };

    const normalized = normalizePocketPayload(payload);

    expect(normalized.id).toBe('rec_abc_123');
    expect(normalized.title).toBe('Team Sync Discussion');
    expect(normalized.audioUrl).toBe('https://cdn.heypocket.com/audio/sample.mp3');
    expect(normalized.summary).toBe('Discussion about launching Notion sync engine.');
    expect(normalized.keyTakeaways).toEqual(['Takeaway 1', 'Takeaway 2']);
    expect(normalized.actionItems.length).toBe(2);
    expect(normalized.actionItems[0].text).toBe('Complete code review');
    expect(normalized.actionItems[0].assignee).toBe('Dan');
    expect(normalized.actionItems[1].text).toBe('Deploy to production');
    expect(normalized.tags).toContain('Engineering');
    expect(normalized.tags).toContain('Pocket');
    expect(normalized.transcriptSegments.length).toBe(2);
  });

  it('should handle flat and minimal payloads gracefully', () => {
    const payload = {
      id: 'simple_id_999',
      name: 'Quick Voice Memo',
      transcript: 'Just a quick reminder to buy milk and call mom.'
    };

    const normalized = normalizePocketPayload(payload as any);

    expect(normalized.id).toBe('simple_id_999');
    expect(normalized.title).toBe('Quick Voice Memo');
    expect(normalized.transcript).toBe('Just a quick reminder to buy milk and call mom.');
    expect(normalized.tags).toContain('Pocket');
  });
});

describe('chunkString', () => {
  it('should return single chunk if string length is within limit', () => {
    const text = 'Hello world, this is a short text.';
    const chunks = chunkString(text, 100);
    expect(chunks).toEqual([text]);
  });

  it('should split long strings without cutting words abruptly', () => {
    const text =
      'The quick brown fox jumps over the lazy dog. '.repeat(100); // 4500 chars
    const chunks = chunkString(text, 1000);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1000);
    }
    // Recombined text content should match
    expect(chunks.join(' ')).toBe(text.trim());
  });
});
