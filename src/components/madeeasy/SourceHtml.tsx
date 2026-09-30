/**
 * Renders the Made Easy portal's own question HTML. The server rebuilds it from an allowlist
 * (src/lib/server/source-html.ts: simple formatting only, images only from the portal's image host)
 * before it is sent, so it is safe to insert here. Images load from that host directly.
 */
export function SourceHtml({ html, className = "" }: { html: string; className?: string }) {
  return (
    <div
      className={`[&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_sub]:text-[0.75em] [&_sup]:text-[0.75em] [&_ul]:list-disc [&_ul]:pl-5 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
