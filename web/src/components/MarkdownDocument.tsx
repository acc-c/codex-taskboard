import { Children, isValidElement, useEffect, useId, useState, type ComponentPropsWithoutRef, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const EXTERNAL_URL = /^(?:https?:|data:|javascript:|vbscript:|file:|\/\/)/i;
const MERMAID_EXTERNAL_RESOURCE = /(?:https?:)?\/\//i;
const EXTERNAL_CSS = /@import|url\s*\(/i;

function isSafeUrl(value: string | undefined, image = false): boolean {
  if (!value) return false;
  if (value.startsWith("#") || value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) return true;
  if (image && value.startsWith("data:image/")) return true;
  return !EXTERNAL_URL.test(value);
}
function readCodeBlock(children: ReactNode) {
  const code = Children.toArray(children).find(
    (child): child is ReactElement<{ className?: string; children?: ReactNode }> => (
      isValidElement(child) && child.type === "code"
    ),
  );
  const language = code?.props.className?.match(/(?:^|\s)language-([^\s]+)/)?.[1]?.toLowerCase() ?? null;
  return { language, source: Children.toArray(code?.props.children).join("") };
}

function MermaidFallback({ source, error = false }: { source: string; error?: boolean }) {
  return (
    <div className="markdown-mermaid-fallback" role={error ? "alert" : undefined}>
      {error && <p>无法渲染 Mermaid 图，下面显示图表源码。</p>}
      <details open={error}>
        <summary>Mermaid 源码</summary>
        <pre><code className="language-mermaid">{source}</code></pre>
      </details>
    </div>
  );
}
function MermaidDiagram({ source }: { source: string }) {
  const reactId = useId();
  const renderId = `taskboard-mermaid-${reactId.replace(/[^A-Za-z0-9_-]/g, "")}`;
  const [theme, setTheme] = useState<"light" | "dark">(() => (
    typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light"
  ));
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.documentElement;
    const observer = new MutationObserver(() => setTheme(root.dataset.theme === "dark" ? "dark" : "light"));
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);
    if (MERMAID_EXTERNAL_RESOURCE.test(source) || EXTERNAL_CSS.test(source)) {
      setFailed(true);
      return undefined;
    }
    void Promise.all([import("mermaid"), import("dompurify")])
      .then(async ([mermaidModule, purifierModule]) => {
        const mermaid = mermaidModule.default;
        const purifier = purifierModule.default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          htmlLabels: false,
          theme: theme === "dark" ? "dark" : "default",
        });
        const rendered = await mermaid.render(renderId, source);
        const sanitized = purifier.sanitize(rendered.svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          FORBID_TAGS: ["foreignObject", "image", "script", "iframe", "style"],
          FORBID_ATTR: ["href", "xlink:href", "src", "onerror", "onclick"],
        });
        const template = document.createElement("template");
        template.innerHTML = sanitized;
        const root = template.content.firstElementChild;
        if (!root || root.localName !== "svg" || template.content.children.length !== 1) throw new Error("Invalid Mermaid SVG");
        if (!cancelled) setSvg(root.outerHTML);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [renderId, source, theme]);

  if (failed) return <div className="markdown-mermaid"><MermaidFallback source={source} error /></div>;
  if (!svg) return <div className="markdown-mermaid" aria-busy="true"><MermaidFallback source={source} /></div>;
  return <div className="markdown-mermaid" role="img" aria-label="Mermaid 图" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function MarkdownPre({ children, ...props }: ComponentPropsWithoutRef<"pre">) {
  const { language, source } = readCodeBlock(children);
  if (language === "mermaid") return <MermaidDiagram source={source} />;
  return <pre {...props}>{children}</pre>;
}

function markdownComponents(onTaskReference?: (identifier: string) => void): Components {
  return {
    pre: MarkdownPre,
    a: ({ href, children, ...props }) => {
      const taskReference = href?.match(/^taskboard:\/\/task\/([^/?#]+)$/)?.[1];
      if (taskReference && onTaskReference) {
        return <a {...props} href={`#${taskReference}`} onClick={(event) => { event.preventDefault(); onTaskReference(taskReference); }}>{children}</a>;
      }
      if (!isSafeUrl(href)) return <span className="markdown-blocked-link">{children}</span>;
      return <a {...props} href={href} target="_blank" rel="noreferrer noopener">{children}</a>;
    },
    img: ({ src, alt, ...props }) => (
      isSafeUrl(src, true)
        ? <img {...props} src={src} alt={alt ?? ""} loading="lazy" />
        : <span className="markdown-blocked-image">{alt || "已阻止外部图片"}</span>
    ),
    input: ({ type, ...props }) => <input {...props} type={type} disabled={type === "checkbox" ? true : props.disabled} />,
  };
}

export interface MarkdownDocumentProps {
  value: string;
  className?: string;
  onTaskReference?: (identifier: string) => void;
}

export function MarkdownDocument({ value, className = "", onTaskReference }: MarkdownDocumentProps) {
  return (
    <div className={`markdown-document ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents(onTaskReference)} skipHtml>
        {value}
      </ReactMarkdown>
    </div>
  );
}
