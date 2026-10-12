"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { track } from "@/lib/activity-client";

const CHATGPT_URL = "https://chatgpt.com/";
/** Longest encoded question passed inside the link itself; a longer one opens an empty chat and relies on the copy. */
const MAX_ENCODED_CHARS = 6000;

type Loaded = { key: string; text: string } | { key: string; error: string };

/**
 * Copies this question (text, options, answer key, explanation) and opens ChatGPT with it filled in.
 * A web page cannot paste into another app, so the text goes two ways: into the link (chatgpt.com/?q=…,
 * which a phone hands to the ChatGPT app) and onto the clipboard for Ctrl/⌘ V. The server builds the text
 * under the same rules as the follow-up: only after the learner has answered, Made Easy only for its owner.
 */
export function SendToChatGpt({ kind, id }: { kind: "made_easy" | "bank"; id: string }) {
  const { t } = useLang();
  const key = `${kind}:${id}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [notice, setNotice] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/ai/chatgpt-text?kind=${kind}&id=${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!res.ok || typeof data.text !== "string") throw new Error(data.error || "Could not prepare this question.");
        setLoaded({ key, text: data.text });
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoaded({ key, error: err instanceof Error ? err.message : "Could not prepare this question." });
      });
    return () => controller.abort();
  }, [kind, id, key]);

  const current = loaded?.key === key ? loaded : null;
  const text = current && "text" in current ? current.text : null;
  const encoded = text ? encodeURIComponent(text) : "";
  const inLink = encoded.length <= MAX_ENCODED_CHARS;
  const href = text && inLink ? `${CHATGPT_URL}?q=${encoded}` : CHATGPT_URL;

  function copy(question: string) {
    track("chatgpt.send", { kind, id });
    const say = (message: string) => setNotice({ key, message });
    const copied = inLink
      ? t({ en: "Copied, and ChatGPT is opening with the question filled in. If the box is empty, paste with Ctrl/⌘ + V.", hi: "कॉपी हो गया, और ChatGPT प्रश्न के साथ खुल रहा है। अगर बॉक्स खाली हो तो Ctrl/⌘ + V से पेस्ट करें।" })
      : t({ en: "Copied. This question is too long for the link, so paste it into ChatGPT with Ctrl/⌘ + V.", hi: "कॉपी हो गया। प्रश्न लिंक के लिए बहुत लंबा है, इसलिए ChatGPT में Ctrl/⌘ + V से पेस्ट करें।" });
    if (!navigator.clipboard?.writeText) { say(t({ en: "Could not copy automatically. Select the text yourself.", hi: "अपने-आप कॉपी नहीं हो सका।" })); return; }
    navigator.clipboard.writeText(question).then(
      () => say(copied),
      () => say(inLink ? t({ en: "ChatGPT is opening with the question filled in. Copying to the clipboard was blocked.", hi: "ChatGPT प्रश्न के साथ खुल रहा है। क्लिपबोर्ड में कॉपी रोक दिया गया।" }) : t({ en: "Could not copy automatically, and the question is too long for the link.", hi: "अपने-आप कॉपी नहीं हो सका, और प्रश्न लिंक के लिए बहुत लंबा है।" })),
    );
  }

  const buttonClass = "inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600";
  return (
    <div className="max-w-md">
      {text
        ? <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => copy(text)} className={buttonClass}>{t({ en: "Send to ChatGPT ↗", hi: "ChatGPT को भेजें ↗" })}</a>
        : <button type="button" disabled className={`${buttonClass} opacity-50`}>{current ? t({ en: "Send to ChatGPT ↗", hi: "ChatGPT को भेजें ↗" }) : t({ en: "Preparing…", hi: "तैयार हो रहा है…" })}</button>}
      {current && "error" in current && <p role="status" className="mt-1 text-[11px] text-slate-500">{current.error}</p>}
      {notice?.key === key && <p role="status" className="mt-1 text-[11px] leading-4 text-slate-600">{notice.message}</p>}
    </div>
  );
}
