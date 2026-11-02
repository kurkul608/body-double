import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-markdown';
import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { cn } from '../lib/utils';
import { Mermaid } from './Mermaid';

const LANG_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  yml: 'yaml',
  html: 'markup',
  xml: 'markup',
  md: 'markdown',
};

function highlight(code: string, lang: string): string | null {
  const resolved = LANG_ALIASES[lang] ?? lang;
  const grammar = Prism.languages[resolved];
  if (!grammar) return null;
  return Prism.highlight(code, grammar, resolved);
}

function renderTex(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, { displayMode, throwOnError: false, strict: false });
}

function MathInline({ tex }: { tex: string }) {
  // KaTeX output is generated from escaped TeX source, safe to inject
  return <span dangerouslySetInnerHTML={{ __html: renderTex(tex, false) }} />;
}

/** Display formula + collapsible raw TeX source with a copy button. */
function MathBlock({ tex }: { tex: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(tex).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="math-block my-3">
      <div
        className="overflow-x-auto py-1"
        dangerouslySetInnerHTML={{ __html: renderTex(tex, true) }}
      />
      <details className="mt-1 text-xs text-ink-soft">
        <summary className="cursor-pointer select-none hover:text-ink">source</summary>
        <div className="mt-1 flex items-start gap-2">
          <pre className="flex-1 overflow-x-auto rounded-lg border border-line bg-card px-3 py-2">
            <code>{tex}</code>
          </pre>
          <button
            type="button"
            onClick={copy}
            className="shrink-0 rounded-md border border-line bg-card px-2 py-1 hover:border-now/60"
          >
            {copied ? '✓ copied' : 'copy'}
          </button>
        </div>
      </details>
    </div>
  );
}

// ```math / ```latex / ```tex fences are display math too (GitHub convention)
const MATH_FENCE = /\blanguage-(math|latex|tex)\b/;

function isMathClass(className: string | undefined, kind: 'inline' | 'display'): boolean {
  if (kind === 'display' && className && MATH_FENCE.test(className)) return true;
  return Boolean(className?.includes(`math-${kind}`));
}

/** Extracts the className of the single <code> child of a <pre>, if any. */
function childCodeClassName(children: ReactNode): string | undefined {
  if (
    children &&
    typeof children === 'object' &&
    'props' in children &&
    children.props &&
    typeof children.props === 'object' &&
    'className' in children.props
  ) {
    return children.props.className as string | undefined;
  }
  return undefined;
}

export interface MarkdownProps {
  children: string;
  /** 'lesson' — full-size article styles; 'chat' — compact bubble styles */
  variant?: 'lesson' | 'chat';
}

export function Markdown({ children, variant = 'lesson' }: MarkdownProps) {
  return (
    <div className={cn(variant === 'lesson' ? 'lesson-md' : 'chat-md')}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        components={{
          pre({ children: preChildren, ...props }) {
            // display math and mermaid render as blocks themselves — unwrap from <pre>
            const childClass = childCodeClassName(preChildren);
            if (isMathClass(childClass, 'display') || childClass?.includes('language-mermaid')) {
              return <>{preChildren}</>;
            }
            return <pre {...props}>{preChildren}</pre>;
          },
          code({ className, children: codeChildren, ...props }) {
            const match = /language-([\w-]+)/.exec(className ?? '');
            const code = String(codeChildren).replace(/\n$/, '');
            if (isMathClass(className, 'display')) return <MathBlock tex={code} />;
            if (isMathClass(className, 'inline')) return <MathInline tex={code} />;
            if (match?.[1] === 'mermaid') return <Mermaid code={code} />;
            if (match?.[1]) {
              const html = highlight(code, match[1]);
              if (html !== null) {
                return (
                  <code
                    className={className}
                    // Prism output is generated from escaped source, safe to inject
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                );
              }
            }
            return (
              <code className={className} {...props}>
                {codeChildren}
              </code>
            );
          },
          table({ children: tableChildren, ...props }) {
            return (
              <div className="table-wrap">
                <table {...props}>{tableChildren}</table>
              </div>
            );
          },
          a({ children: linkChildren, ...props }) {
            return (
              <a target="_blank" rel="noreferrer" {...props}>
                {linkChildren}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
