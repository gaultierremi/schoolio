"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Options as RehypeKatexOptions } from "rehype-katex";

const rehypeKatexOptions: RehypeKatexOptions = { strict: false };

export default function MarkdownLatex({ content }: { content: string }) {
  return (
    <div className="prose-exercise">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, rehypeKatexOptions]]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
