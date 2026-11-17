import { Check, Copy } from 'lucide-react';
import React, { useState } from 'react';

interface MessageRendererProps {
  content: string;
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="my-3 rounded-lg bg-slate-950/90 border border-cyan-500/25 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800">
        <span className="font-mono text-xs text-cyan-300 uppercase tracking-wider">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-cyan-200 hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Copy code block"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-300">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-xs sm:text-[13px] leading-relaxed font-mono text-slate-200 hud-scrollbar">
        <code>{highlightCode(code)}</code>
      </pre>
    </div>
  );
}

const TOKEN_REGEX =
  /(\/\/.*$|#.*$|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:def|class|import|from|return|if|elif|else|for|while|break|continue|try|except|finally|with|as|async|await|function|const|let|var|interface|type|export|default|public|private|protected|static|void|int|float|double|char|bool|boolean|struct|include|printf|scanf|SELECT|FROM|WHERE|JOIN|GROUP|BY|ORDER|INSERT|INTO|VALUES|CREATE|TABLE|PRIMARY|KEY|NULL|TRUE|FALSE|true|false|null|None|self|this|new)\b|\b\d+(?:\.\d+)?\b)/gm;

function highlightCode(code: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  TOKEN_REGEX.lastIndex = 0;
  while ((match = TOKEN_REGEX.exec(code)) !== null) {
    if (match.index > lastIndex) {
      parts.push(code.slice(lastIndex, match.index));
    }
    const token = match[0];
    let className = 'text-slate-200';
    if (token.startsWith('//') || token.startsWith('/*') || token.startsWith('#')) {
      className = 'text-slate-500 italic';
    } else if (token.startsWith('"') || token.startsWith("'")) {
      className = 'text-emerald-300';
    } else if (/^\d/.test(token)) {
      className = 'text-amber-300';
    } else {
      className = 'text-cyan-300 font-medium';
    }
    parts.push(
      <span key={key++} className={className}>
        {token}
      </span>
    );
    lastIndex = TOKEN_REGEX.lastIndex;
  }

  if (lastIndex < code.length) {
    parts.push(code.slice(lastIndex));
  }
  return parts;
}

function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return tokens.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-950/90 border border-cyan-500/20 font-mono text-[0.85em] text-cyan-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={idx} className="italic text-slate-200">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function renderProseBlock(block: string, blockKey: number) {
  const lines = block.split('\n');
  const elements: React.ReactNode[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;

  const flushList = (keySuffix: number) => {
    if (!listBuffer) return;
    if (listBuffer.ordered) {
      elements.push(
        <ol
          key={`ol-${blockKey}-${keySuffix}`}
          className="my-2 pl-5 list-decimal space-y-1 text-slate-200"
        >
          {listBuffer.items.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );
    } else {
      elements.push(
        <ul
          key={`ul-${blockKey}-${keySuffix}`}
          className="my-2 pl-5 list-disc space-y-1 text-slate-200"
        >
          {listBuffer.items.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
    }
    listBuffer = null;
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList(idx);
      return;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushList(idx);
      const level = headingMatch[1].length;
      elements.push(
        <h4
          key={`h-${blockKey}-${idx}`}
          className={`font-semibold text-cyan-200 mt-3 mb-1 ${
            level === 1 ? 'text-base' : 'text-sm'
          }`}
        >
          {renderInline(headingMatch[2])}
        </h4>
      );
      return;
    }

    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      if (!listBuffer || listBuffer.ordered) {
        flushList(idx);
        listBuffer = { ordered: false, items: [] };
      }
      listBuffer.items.push(bulletMatch[1]);
      return;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      if (!listBuffer || !listBuffer.ordered) {
        flushList(idx);
        listBuffer = { ordered: true, items: [] };
      }
      listBuffer.items.push(orderedMatch[1]);
      return;
    }

    flushList(idx);
    elements.push(
      <p key={`p-${blockKey}-${idx}`} className="leading-relaxed my-1.5 text-slate-200">
        {renderInline(trimmed)}
      </p>
    );
  });

  flushList(lines.length);
  return <div key={blockKey}>{elements}</div>;
}

export function MessageRenderer({ content }: MessageRendererProps) {
  const segments: Array<{ type: 'text' | 'code'; lang?: string; value: string }> = [];
  const fenceRegex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: content.slice(lastIndex, match.index),
      });
    }
    segments.push({
      type: 'code',
      lang: match[1] || 'code',
      value: match[2].replace(/\n$/, ''),
    });
    lastIndex = fenceRegex.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      value: content.slice(lastIndex),
    });
  }

  return (
    <div className="text-sm sm:text-[15px] break-words">
      {segments.map((seg, idx) =>
        seg.type === 'code' ? (
          <CodeBlock key={idx} language={seg.lang ?? 'code'} code={seg.value} />
        ) : (
          renderProseBlock(seg.value, idx)
        )
      )}
    </div>
  );
}
