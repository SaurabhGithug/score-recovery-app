/**
 * Third-party question HTML (the Made Easy portal) made safe to render: an allowlist rebuild, not a
 * filter. Only simple formatting tags survive, with no attributes; an <img> survives only when its
 * src is on the portal's image host. Everything else is dropped or escaped. The portal uses p, div,
 * br, em, strong, sub, sup, ol, li and img (checked 2026-09-30 across the four captured tests).
 */

const ALLOWED_TAGS = new Set(["p", "div", "br", "em", "strong", "b", "i", "u", "sub", "sup", "ol", "ul", "li", "span"]);
const VOID_TAGS = new Set(["br"]);
/** The portal's image host; nothing else may be loaded by a learner's browser from question HTML. */
const IMAGE_SRC = /^https:\/\/cdnstatic\.madeeasyprime\.com\/[A-Za-z0-9._~\/-]+\.(png|jpe?g|gif|webp|svg)$/i;

const NAMED_ENTITY = /^&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});/i;

function escapeText(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "&") {
      const m = NAMED_ENTITY.exec(text.slice(i));
      if (m) {
        out += m[0];
        i += m[0].length - 1;
      } else out += "&amp;";
    } else if (ch === ">") out += "&gt;";
    else if (ch === '"') out += "&quot;";
    else out += ch;
  }
  return out;
}

export function sanitizeSourceHtml(html: string): string {
  // Script, style and similar blocks go with their content (it is code, not question text).
  html = html.replace(/<(script|style|noscript|template|iframe|object)\b[\s\S]*?<\/\1\s*>/gi, "");
  let out = "";
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)\/?>|<!--[\s\S]*?-->|([^<]+)|(<)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const [, closing, rawName, attrs, text, strayLt] = m;
    if (text !== undefined) {
      out += escapeText(text);
    } else if (strayLt !== undefined) {
      out += "&lt;";
    } else if (rawName) {
      const name = rawName.toLowerCase();
      if (name === "img") {
        if (closing) continue;
        const src = /\bsrc\s*=\s*"([^"]*)"/i.exec(attrs ?? "")?.[1] ?? /\bsrc\s*=\s*'([^']*)'/i.exec(attrs ?? "")?.[1];
        if (src && IMAGE_SRC.test(src)) out += `<img src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
      } else if (ALLOWED_TAGS.has(name)) {
        if (VOID_TAGS.has(name)) out += closing ? "" : `<${name}>`;
        else out += closing ? `</${name}>` : `<${name}>`;
      }
      // Any other tag (script, style, iframe, a, table…) is dropped; its text content, if any, stays as text.
    }
    // Comments are dropped.
  }
  return out;
}

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  ndash: "–", mdash: "—", times: "×", divide: "÷", deg: "°", bull: "•", hellip: "…", minus: "−", plusmn: "±",
  le: "≤", ge: "≥", ne: "≠", asymp: "≈", prop: "∝", infin: "∞", radic: "√", sum: "∑", micro: "µ", middot: "·",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", epsilon: "ε", eta: "η", theta: "θ", lambda: "λ",
  mu: "μ", pi: "π", rho: "ρ", sigma: "σ", Sigma: "Σ", tau: "τ", phi: "φ", Phi: "Φ", omega: "ω", Omega: "Ω",
  lowast: "∗", copy: "©", rarr: "→", larr: "←", harr: "↔", sup2: "²", sup3: "³", frac12: "½", frac14: "¼",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name] ?? whole;
  });
}

/** Plain text of source HTML, for search, matching and model prompts. Images become "[image]". */
export function sourceHtmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<img\b[^>]*>/gi, " [image] ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<sup>(.*?)<\/sup>/gi, "^$1")
      .replace(/<sub>(.*?)<\/sub>/gi, "_$1")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** The allowed image URLs in source HTML, in order. */
export function sourceHtmlImages(html: string): string[] {
  return [...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi)].map((m) => m[1]).filter((src) => IMAGE_SRC.test(src));
}
