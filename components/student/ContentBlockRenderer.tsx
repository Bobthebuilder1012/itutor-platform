'use client';

type ContentBlock =
  | { type: 'markdown'; value: string }
  | { type: 'bullet_list'; items: string[] }
  | { type: 'paragraph'; text: string }
  | { type: string; [key: string]: unknown };

function isParagraphBlock(block: ContentBlock): block is Extract<ContentBlock, { type: 'paragraph' }> {
  return block.type === 'paragraph' && typeof (block as { text?: unknown }).text === 'string';
}

function isBulletListBlock(block: ContentBlock): block is Extract<ContentBlock, { type: 'bullet_list' }> {
  return (
    block.type === 'bullet_list' &&
    Array.isArray((block as { items?: unknown }).items) &&
    (block as { items: unknown[] }).items.every((item) => typeof item === 'string')
  );
}

function isMarkdownBlock(block: ContentBlock): block is Extract<ContentBlock, { type: 'markdown' }> {
  return block.type === 'markdown' && typeof (block as { value?: unknown }).value === 'string';
}

function toBlocks(content: unknown): ContentBlock[] {
  if (!content) return [];
  if (Array.isArray(content)) return content as ContentBlock[];
  return [];
}

export default function ContentBlockRenderer({ content }: { content: unknown }) {
  const blocks = toBlocks(content);
  if (blocks.length === 0) return <p className="text-sm text-gray-600">No additional details yet.</p>;

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (isParagraphBlock(block)) return <p key={index} className="text-sm text-gray-700">{block.text}</p>;
        if (isBulletListBlock(block))
          return (
            <ul key={index} className="list-disc space-y-1 pl-5 text-sm text-gray-700">
              {block.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          );
        if (isMarkdownBlock(block)) return <p key={index} className="whitespace-pre-wrap text-sm text-gray-700">{block.value}</p>;
        return null;
      })}
    </div>
  );
}

