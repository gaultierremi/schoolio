export type UaaChunk = {
  code: string;        // "UAA5", "UAA6", etc.
  label: string;       // "Réactions chimiques", etc.
  ordinal: number;     // 1, 2, 3, ...
  content: string;     // markdown body, including the UAA header line
};

const UAA_HEADER_RE = /^UAA\s*(\d+)\s*[:—-]\s*(.+)$/im;

export function chunkByUaa(markdown: string): UaaChunk[] {
  const lines = markdown.split("\n");
  const chunks: UaaChunk[] = [];
  let current: UaaChunk | null = null;
  let ordinal = 0;

  for (const line of lines) {
    const match = line.match(UAA_HEADER_RE);
    if (match) {
      if (current) chunks.push(current);
      ordinal++;
      current = {
        code: `UAA${match[1]}`,
        label: match[2].trim(),
        ordinal,
        content: line,
      };
    } else if (current) {
      current.content += "\n" + line;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
