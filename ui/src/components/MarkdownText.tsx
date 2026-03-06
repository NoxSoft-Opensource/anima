import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownTextProps = {
  value: string;
  className?: string;
};

export default function MarkdownText({ value, className }: MarkdownTextProps): React.ReactElement {
  return (
    <div className={className ?? "anima-markdown"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer">
              {props.children}
            </a>
          ),
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}
