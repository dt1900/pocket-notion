// Vibe-coded by Antigravity v2.0 on 2026-08-13. Driven by @dt1900.

import { describe, expect, it } from 'vitest';
import { chunkString, NotionSyncService } from '../src/services/notion.js';
import { NormalizedPocketNote } from '../src/types/heypocket.js';

describe('NotionSyncService block and property formatting', () => {
  const sampleNote: NormalizedPocketNote = {
    id: 'test_rec_100',
    title: 'Executive Sync on AI Roadmap',
    createdAt: new Date('2026-08-13T14:30:00.000Z'),
    durationSeconds: 300,
    audioUrl: 'https://example.com/audio.m4a',
    summary: 'Discussion on deploying edge serverless functions.',
    keyTakeaways: ['High scalability with Cloudflare Workers', 'Zero idle cost with AWS Lambda'],
    transcript: 'Alex: Welcome everyone.\nDan: Thanks for joining.',
    transcriptSegments: [
      { speaker: 'Alex', text: 'Welcome everyone.' },
      { speaker: 'Dan', text: 'Thanks for joining.' }
    ],
    actionItems: [
      { text: 'Deploy Cloudflare Worker', completed: false, assignee: 'Dan' },
      { text: 'Set up Notion database', completed: true }
    ],
    tags: ['AI', 'Serverless', 'Pocket'],
    mindMapPoints: ['Architecture Overview', '  • Webhooks', '  • Database Sync'],
    rawPayload: {}
  };

  it('builds valid schema-adapted properties', () => {
    const service = new NotionSyncService({ apiKey: 'fake_key', databaseId: 'fake_db' });

    const mockSchema = {
      Name: { type: 'title' },
      Date: { type: 'date' },
      Tags: { type: 'multi_select' },
      Audio: { type: 'url' },
      'Pocket ID': { type: 'rich_text' },
      Duration: { type: 'number' }
    };

    const properties = (service as any).buildPageProperties(sampleNote, mockSchema);

    expect(properties.Name.title[0].text.content).toBe('Executive Sync on AI Roadmap');
    expect(properties.Date.date.start).toBe('2026-08-13T14:30:00.000Z');
    expect(properties.Tags.multi_select.map((t: any) => t.name)).toContain('AI');
    expect(properties.Audio.url).toBe('https://example.com/audio.m4a');
    expect(properties['Pocket ID'].rich_text[0].text.content).toBe('test_rec_100');
    expect(properties.Duration.number).toBe(300);
  });

  it('generates rich blocks including callouts, to-do lists, and transcripts', () => {
    const service = new NotionSyncService({ apiKey: 'fake_key', databaseId: 'fake_db' });
    const blocks = (service as any).buildPageBlocks(sampleNote);

    expect(blocks.length).toBeGreaterThan(5);

    // Should contain audio bookmark
    const bookmarkBlock = blocks.find((b: any) => b.type === 'bookmark');
    expect(bookmarkBlock).toBeDefined();

    // Should contain AI summary callout
    const calloutBlock = blocks.find((b: any) => b.type === 'callout');
    expect(calloutBlock).toBeDefined();

    // Should contain To-Do items
    const todoBlocks = blocks.filter((b: any) => b.type === 'to_do');
    expect(todoBlocks.length).toBe(2);
    expect(todoBlocks[0].to_do.rich_text[0].text.content).toContain('Deploy Cloudflare Worker @Dan');

    // Should contain transcript blocks
    const transcriptHeading = blocks.find(
      (b: any) => b.type === 'heading_2' && b.heading_2.rich_text[0].text.content.includes('Transcript')
    );
    expect(transcriptHeading).toBeDefined();
  });
});
