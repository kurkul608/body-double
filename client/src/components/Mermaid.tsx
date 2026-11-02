import { useEffect, useId, useRef, useState } from 'react';

// mermaid is ~1MB — load it only when a diagram is actually on screen.
let mermaidPromise: Promise<typeof import('mermaid')['default']> | null = null;
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      m.default.initialize({ startOnLoad: false, theme: 'neutral', fontFamily: 'inherit' });
      return m.default;
    });
  }
  return mermaidPromise;
}

export function Mermaid({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const codeRef = useRef(code);
  codeRef.current = code;

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);
    loadMermaid()
      .then((mermaid) => mermaid.render(`mmd-${id}`, code))
      .then(({ svg: rendered }) => {
        if (!cancelled && codeRef.current === code) setSvg(rendered);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (failed) {
    // invalid diagram source — fall back to a plain code block
    return (
      <pre>
        <code>{code}</code>
      </pre>
    );
  }
  if (!svg) {
    return <div className="my-3 animate-pulse rounded-xl border border-line bg-card p-6 text-xs text-ink-soft">rendering diagram…</div>;
  }
  return (
    <div
      className="mermaid-diagram my-3 overflow-x-auto"
      // mermaid.render output is sanitized SVG
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
