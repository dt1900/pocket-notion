// Vibe-coded by Antigravity v2.0 on 2026-08-13. Driven by @dt1900.

import { Client } from '@notionhq/client';
import {
  BlockObjectRequest,
  CreatePageParameters,
  DatabaseObjectResponse
} from '@notionhq/client/build/src/api-endpoints.js';
import { NormalizedPocketNote } from '../types/heypocket.js';

export interface NotionSyncConfig {
  apiKey: string;
  databaseId: string;
}

export interface SyncResult {
  success: boolean;
  pageId?: string;
  url?: string;
  isUpdate?: boolean;
  error?: string;
}

/**
 * Service to manage syncing HeyPocket notes to Notion databases.
 */
export class NotionSyncService {
  private client: Client;
  private databaseId: string;

  constructor(config: NotionSyncConfig) {
    this.client = new Client({ auth: config.apiKey });
    this.databaseId = config.databaseId.replace(/-/g, '');
  }

  /**
   * Validates access to the Notion database or page.
   */
  async validateConnection(): Promise<{ valid: boolean; title?: string; isDatabase?: boolean; error?: string }> {
    try {
      // First try database
      try {
        const response = await this.client.databases.retrieve({
          database_id: this.databaseId
        });
        const db = response as DatabaseObjectResponse;
        const title = db.title?.[0]?.plain_text || 'Untitled Database';
        return { valid: true, title, isDatabase: true };
      } catch (dbErr: any) {
        if (dbErr?.message?.includes('is a page, not a database') || dbErr?.code === 'validation_error') {
          const page = await this.client.pages.retrieve({ page_id: this.databaseId });
          const title = (page as any).properties?.title?.title?.[0]?.plain_text || 'Pocket Content';
          return { valid: true, title, isDatabase: false };
        }
        throw dbErr;
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Failed to connect to Notion'
      };
    }
  }

  /**
   * Syncs a normalized pocket note to Notion.
   */
  async syncNote(note: NormalizedPocketNote): Promise<SyncResult> {
    try {
      // Step 1: Check if target is Database or Page
      let isDatabase = true;
      let propertiesSchema: Record<string, any> = {};

      try {
        const dbResponse = (await this.client.databases.retrieve({
          database_id: this.databaseId
        })) as DatabaseObjectResponse;
        propertiesSchema = dbResponse.properties;
      } catch (dbErr: any) {
        if (dbErr?.message?.includes('is a page, not a database') || dbErr?.code === 'validation_error') {
          isDatabase = false;
        } else {
          throw dbErr;
        }
      }

      // Step 2: Build page body blocks
      const children = this.buildPageBlocks(note);

      if (isDatabase) {
        // Database Mode
        const existingPageId = await this.findExistingPageByPocketId(note.id, propertiesSchema);
        const properties = this.buildPageProperties(note, propertiesSchema);

        if (existingPageId) {
          await this.client.pages.update({
            page_id: existingPageId,
            properties: properties as never
          });

          await this.replacePageBlocks(existingPageId, children);

          return { success: true, pageId: existingPageId, isUpdate: true };
        }

        const newPage = await this.client.pages.create({
          parent: { database_id: this.databaseId },
          icon: { type: 'emoji', emoji: '🎙️' },
          properties: properties as never,
          children: children
        });

        return {
          success: true,
          pageId: newPage.id,
          url: 'url' in newPage ? (newPage.url as string) : undefined,
          isUpdate: false
        };
      } else {
        // Page Mode (Creating child page under parent page)
        const existingChildPageId = await this.findExistingChildPage(note);

        if (existingChildPageId) {
          // Update title if needed
          await this.client.pages.update({
            page_id: existingChildPageId,
            properties: {
              title: {
                title: [{ type: 'text', text: { content: truncateString(note.title, 2000) } }]
              }
            } as never
          });

          // Replace old blocks with fresh finalized blocks
          await this.replacePageBlocks(existingChildPageId, children);

          return {
            success: true,
            pageId: existingChildPageId,
            isUpdate: true
          };
        }

        const newPage = await this.client.pages.create({
          parent: { page_id: this.databaseId },
          icon: { type: 'emoji', emoji: '🎙️' },
          properties: {
            title: {
              title: [{ type: 'text', text: { content: truncateString(note.title, 2000) } }]
            }
          } as never,
          children: children
        });

        return {
          success: true,
          pageId: newPage.id,
          url: 'url' in newPage ? (newPage.url as string) : undefined,
          isUpdate: false
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Notion sync error'
      };
    }
  }

  /**
   * Replaces existing blocks of a page with fresh content.
   */
  private async replacePageBlocks(pageId: string, newBlocks: BlockObjectRequest[]): Promise<void> {
    try {
      const existing = await this.client.blocks.children.list({ block_id: pageId, page_size: 100 });
      await Promise.all(
        existing.results.map((block) =>
          this.client.blocks.delete({ block_id: block.id }).catch(() => {})
        )
      );
    } catch {
      // ignore list error
    }

    if (newBlocks.length > 0) {
      await this.client.blocks.children.append({
        block_id: pageId,
        children: newBlocks
      });
    }
  }

  /**
   * Finds an existing child page under the parent page matching this note.
   */
  private async findExistingChildPage(note: NormalizedPocketNote): Promise<string | null> {
    try {
      const response = await this.client.blocks.children.list({
        block_id: this.databaseId,
        page_size: 50
      });

      for (const block of response.results) {
        if (block.type === 'child_page' && (block as any).child_page?.title) {
          const childTitle = String((block as any).child_page.title).trim();
          // Check if title matches or starts with the same title
          if (childTitle === note.title.trim() && !childTitle.startsWith('Pocket Note -')) {
            return block.id;
          }
        }
      }
    } catch {
      // Ignore query error and create new page
    }
    return null;
  }

  /**
   * Finds an existing page matching the given HeyPocket ID.
   */
  private async findExistingPageByPocketId(
    pocketId: string,
    propertiesSchema: Record<string, any>
  ): Promise<string | null> {
    try {
      // Look for a property named "Pocket ID" or "ID"
      const idPropEntry = Object.entries(propertiesSchema).find(
        ([name, prop]) =>
          ['pocket id', 'pocket_id', 'id', 'recording id'].includes(name.toLowerCase()) &&
          (prop.type === 'rich_text' || prop.type === 'title')
      );

      if (!idPropEntry) return null;

      const [propName, propConfig] = idPropEntry;

      const filter: any =
        propConfig.type === 'title'
          ? { property: propName, title: { equals: pocketId } }
          : { property: propName, rich_text: { equals: pocketId } };

      const response = await this.client.databases.query({
        database_id: this.databaseId,
        filter: filter,
        page_size: 1
      });

      if (response.results.length > 0) {
        return response.results[0].id;
      }
    } catch {
      // If query fails (e.g. filter mismatch), continue with page creation
    }
    return null;
  }

  /**
   * Intelligently builds property values according to the target Notion database schema.
   */
  private buildPageProperties(
    note: NormalizedPocketNote,
    schema: Record<string, any>
  ): Record<string, any> {
    const props: Record<string, any> = {};

    for (const [name, config] of Object.entries(schema)) {
      const lowerName = name.toLowerCase();

      switch (config.type) {
        case 'title':
          props[name] = {
            title: [
              {
                type: 'text',
                text: { content: truncateString(note.title, 2000) }
              }
            ]
          };
          break;

        case 'date':
          if (
            lowerName.includes('date') ||
            lowerName.includes('created') ||
            lowerName.includes('recorded') ||
            lowerName.includes('time')
          ) {
            props[name] = {
              date: {
                start: note.createdAt.toISOString()
              }
            };
          }
          break;

        case 'multi_select':
          if (lowerName.includes('tag') || lowerName.includes('topic') || lowerName.includes('category')) {
            props[name] = {
              multi_select: note.tags.slice(0, 10).map((t) => ({
                name: truncateString(t.replace(/,/g, ''), 100)
              }))
            };
          }
          break;

        case 'url':
          if (
            note.audioUrl &&
            (lowerName.includes('audio') ||
              lowerName.includes('url') ||
              lowerName.includes('recording') ||
              lowerName.includes('link'))
          ) {
            props[name] = {
              url: note.audioUrl
            };
          }
          break;

        case 'rich_text':
          if (
            lowerName.includes('pocket id') ||
            lowerName.includes('pocket_id') ||
            lowerName === 'id' ||
            lowerName.includes('external id')
          ) {
            props[name] = {
              rich_text: [{ type: 'text', text: { content: note.id } }]
            };
          } else if (lowerName.includes('summary') && note.summary) {
            props[name] = {
              rich_text: [{ type: 'text', text: { content: truncateString(note.summary, 2000) } }]
            };
          }
          break;

        case 'number':
          if (note.durationSeconds && (lowerName.includes('duration') || lowerName.includes('seconds'))) {
            props[name] = {
              number: note.durationSeconds
            };
          }
          break;

        case 'status':
          // Set to default status or "Done" if available
          break;
      }
    }

    // Ensure title is present even if name didn't match
    const titleKey = Object.keys(schema).find((k) => schema[k].type === 'title') || 'Name';
    if (!props[titleKey]) {
      props[titleKey] = {
        title: [{ type: 'text', text: { content: note.title } }]
      };
    }

    return props;
  }

  /**
   * Constructs the structured Notion page blocks.
   */
  private buildPageBlocks(note: NormalizedPocketNote): BlockObjectRequest[] {
    const blocks: BlockObjectRequest[] = [];

    // 1. Audio Link (if available)
    if (note.audioUrl) {
      blocks.push({
        object: 'block',
        type: 'bookmark',
        bookmark: {
          url: note.audioUrl,
          caption: [{ type: 'text', text: { content: 'Original Audio Recording' } }]
        }
      });
    }

    // 2. Summary Callout Block
    if (note.summary || note.keyTakeaways.length > 0) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: '✨ AI Summary' } }]
        }
      });

      const summaryContent = note.summary || 'Summary generated from Pocket voice note.';
      const summaryChunks = chunkString(summaryContent, 1900);

      for (const chunk of summaryChunks) {
        blocks.push({
          object: 'block',
          type: 'callout',
          callout: {
            icon: { type: 'emoji', emoji: '💡' },
            rich_text: [{ type: 'text', text: { content: chunk } }]
          }
        });
      }

      // Key Takeaways
      if (note.keyTakeaways.length > 0) {
        for (const takeaway of note.keyTakeaways) {
          blocks.push({
            object: 'block',
            type: 'bulleted_list_item',
            bulleted_list_item: {
              rich_text: [{ type: 'text', text: { content: truncateString(takeaway, 1900) } }]
            }
          });
        }
      }
    }

    // 3. Action Items (To-Do Blocks)
    if (note.actionItems.length > 0) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: '✅ Action Items' } }]
        }
      });

      for (const action of note.actionItems) {
        const extraInfo = [
          action.assignee ? `@${action.assignee}` : '',
          action.due_date ? `(Due: ${action.due_date})` : ''
        ]
          .filter(Boolean)
          .join(' ');

        const textContent = extraInfo ? `${action.text} ${extraInfo}` : action.text;

        blocks.push({
          object: 'block',
          type: 'to_do',
          to_do: {
            checked: action.completed ?? false,
            rich_text: [{ type: 'text', text: { content: truncateString(textContent, 1900) } }]
          }
        });
      }
    }

    // 4. Mind Map / Key Points (Rendered as visual diagram image in Notion)
    if (note.mindMapPoints.length > 0) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: '🧠 Mind Map & Structure' } }]
        }
      });

      const mermaidDiagram = this.buildMermaidMindMap(note.title, note.mindMapPoints);
      const encodedDiagram = Buffer.from(mermaidDiagram).toString('base64');
      const diagramImageUrl = `https://mermaid.ink/img/${encodedDiagram}`;

      // 1. Direct Visual Diagram Graphic (Image Block)
      blocks.push({
        object: 'block',
        type: 'image',
        image: {
          type: 'external',
          external: {
            url: diagramImageUrl
          }
        }
      });

      // 2. Collapsible toggle containing Mermaid code for easy editing/copying
      blocks.push({
        object: 'block',
        type: 'toggle',
        toggle: {
          rich_text: [{ type: 'text', text: { content: '🔍 View Diagram Source (Mermaid)' } }],
          children: [
            {
              object: 'block',
              type: 'code',
              code: {
                language: 'mermaid',
                rich_text: [{ type: 'text', text: { content: mermaidDiagram } }]
              }
            }
          ]
        }
      });
    }

    // 5. Full Transcript (with speaker support and chunking)
    if (note.transcript || note.transcriptSegments.length > 0) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: '🎙️ Transcript' } }]
        }
      });

      if (note.transcriptSegments.length > 0) {
        for (const segment of note.transcriptSegments) {
          const richText: any[] = [];
          if (segment.speaker) {
            richText.push({
              type: 'text',
              text: { content: `${segment.speaker}: ` },
              annotations: { bold: true }
            });
          }
          richText.push({
            type: 'text',
            text: { content: segment.text }
          });

          // If segment is > 1900 chars, chunk it
          const fullText = `${segment.speaker ? segment.speaker + ': ' : ''}${segment.text}`;
          if (fullText.length > 1900) {
            const chunks = chunkString(fullText, 1900);
            for (const chunk of chunks) {
              blocks.push({
                object: 'block',
                type: 'paragraph',
                paragraph: {
                  rich_text: [{ type: 'text', text: { content: chunk } }]
                }
              });
            }
          } else {
            blocks.push({
              object: 'block',
              type: 'paragraph',
              paragraph: { rich_text: richText }
            });
          }
        }
      } else if (note.transcript) {
        const paragraphs = note.transcript.split(/\n\n+/);
        for (const para of paragraphs) {
          const chunks = chunkString(para, 1900);
          for (const chunk of chunks) {
            blocks.push({
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [{ type: 'text', text: { content: chunk } }]
              }
            });
          }
        }
      }
    }

    // 6. Metadata Toggle Block
    blocks.push({
      object: 'block',
      type: 'toggle',
      toggle: {
        rich_text: [{ type: 'text', text: { content: 'ℹ️ Pocket Metadata' } }],
        children: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: `Pocket ID: ${note.id}\nRecorded At: ${note.createdAt.toISOString()}\nDuration: ${
                      note.durationSeconds ? `${note.durationSeconds}s` : 'N/A'
                    }`
                  }
                }
              ]
            }
          }
        ]
      }
    });

    // Notion API allows up to 100 blocks per request
    return blocks.slice(0, 100);
  }

  /**
   * Generates standard, cross-platform Mermaid.js flowchart code for Notion.
   */
  private buildMermaidMindMap(title: string, points: string[]): string {
    const sanitize = (text: string) =>
      text
        .replace(/["\n\r`']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const rootLabel = sanitize(title || 'Pocket Voice Note');
    let mermaid = 'graph TD\n';
    mermaid += `  ROOT["🎙️ ${truncateString(rootLabel, 80)}"]\n`;

    points.slice(0, 15).forEach((pt, index) => {
      const nodeId = `NODE_${index + 1}`;
      if (pt.includes(':')) {
        const parts = pt.split(':');
        const topic = sanitize(parts[0]);
        const detail = sanitize(parts.slice(1).join(':'));
        mermaid += `  ROOT -- "Topic" --> ${nodeId}["${truncateString(topic, 60)}"]\n`;
        if (detail) {
          const detailId = `DETAIL_${index + 1}`;
          mermaid += `  ${nodeId} --> ${detailId}["${truncateString(detail, 80)}"]\n`;
        }
      } else {
        mermaid += `  ROOT --> ${nodeId}["${truncateString(sanitize(pt), 80)}"]\n`;
      }
    });

    return mermaid;
  }
}

/**
 * Safely splits a string into chunks of max length, respecting whitespace.
 */
export function chunkString(str: string, maxLength = 1900): string[] {
  if (!str) return [];
  if (str.length <= maxLength) return [str];

  const chunks: string[] = [];
  let remaining = str;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = remaining.lastIndexOf(' ', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks;
}

function truncateString(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}
