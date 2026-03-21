'use client';

type ContentBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

export default function ContentBlockRenderer({ blocks }: { blocks: unknown }) {
  const parsedBlocks = Array.isArray(blocks) ? (blocks as ContentBlock[]) : [];

  if (parsedBlocks.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
        No additional content has been published yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {parsedBlocks.map((block, idx) => {
        if (block.type === 'heading') {
          return (
            <h3 key={idx} className="text-lg font-semibold text-gray-900">
              {block.text}
            </h3>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={idx} className="list-disc space-y-1 pl-5 text-sm text-gray-700">
              {block.items?.map((item, itemIdx) => (
                <li key={itemIdx}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={idx} className="text-sm text-gray-700">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

