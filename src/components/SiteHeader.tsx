"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLang } from "@/lib/i18n";
import { useAttemptMode } from "@/lib/attempt-mode";
import { useUser } from "@/lib/user-context";
import { isLearningOnlyProfile, profileHome } from "@/lib/profile-access";

// "My results" opens the Tests page's past-tests view: that is where server-saved results live
// (/dashboard only shows older results saved in this browser).
const PRIMARY = [
  { href: "/learn", en: "Learn", hi: "सीखें", icon: "book" },
  { href: "/papers", en: "Tests", hi: "टेस्ट", icon: "paper" },
  { href: "/papers?view=past", en: "My results", hi: "मेरे परिणाम", icon: "chart" },
  { href: "/syllabus", en: "Syllabus", hi: "पाठ्यक्रम", icon: "list" },
];

/** Which main destination the current page belongs to ("My results" is the Tests page's past view). */
function isActive(href: string, pathname: string, pastView: boolean): boolean {
  if (href === "/papers?view=past") return (pathname === "/papers" && pastView) || pathname.startsWith("/papers/attempts") || pathname.startsWith("/recovery-lab/");
  if (href === "/papers") return (pathname.startsWith("/papers") && !pastView && !pathname.startsWith("/papers/attempts")) || pathname.startsWith("/recovery-lab/testbook");
  return pathname.startsWith(href);
}

/** The main destinations, always visible: links in the header on wider screens, a tab bar at the bottom on phones. */
function MainNavLinks({ variant }: { variant: "top" | "bottom" }) {
  const { lang } = useLang();
  const { currentUser } = useUser();
  const pathname = usePathname();
  const pastView = useSearchParams().get("view") === "past";
  const destinations = isLearningOnlyProfile(currentUser) ? PRIMARY.slice(0, 1) : PRIMARY;
  return <>{destinations.map(item => {
    const active = isActive(item.href, pathname, pastView);
    const label = lang === "hi" ? item.hi : item.en;
    return variant === "top"
      ? <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center rounded-lg px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-600 ${active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>{label}</Link>
      : <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-blue-600 ${active ? "text-blue-700" : "text-slate-500"}`}><NavIcon name={item.icon} />{label}</Link>;
  })}</>;
}

/** Phone tab bar. Rendered last in the layout and sticky, so it never covers page content. Hidden during tests and drills. */
export function MobileTabBar() {
  const { kind } = useAttemptMode();
  if (kind !== null) return null;
  return <nav aria-label="Main" className="sticky bottom-0 z-30 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
    <Suspense fallback={null}><MainNavLinks variant="bottom" /></Suspense>
  </nav>;
}

function NavIcon({ name }: { name: string }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {name === "book" ? <><path d="M12 5v15M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1Z" /></> : name === "list" ? <><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></> : name === "paper" ? <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></> : <><path d="M4 4v16h16M8 16v-4M13 16V8M18 16V5" /></>}
  </svg>;
}

function NavigationDrawer({ onClose }: { onClose: () => void }) {
  const { lang, setLang } = useLang();
  const { currentUser, openProfileModal, logout } = useUser();
  const pathname = usePathname();
  const pastView = useSearchParams().get("view") === "past";
  const destinations = isLearningOnlyProfile(currentUser) ? PRIMARY.slice(0, 1) : PRIMARY;
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const trigger = document.activeElement;
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);
  return <dialog ref={dialog} id="app-navigation" aria-labelledby="navigation-title" className="app-navigation-drawer bg-white text-slate-900 shadow-2xl" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="flex min-h-full flex-col p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-5">
        <h2 id="navigation-title" className="text-base font-semibold">{lang === "hi" ? "आपका अध्ययन" : "Your study space"}</h2>
        <button ref={closeButton} type="button" onClick={onClose} aria-label={lang === "hi" ? "मेन्यू बंद करें" : "Close menu"} className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 6 12 12M6 18 18 6" /></svg></button>
      </div>
      <nav aria-label="Main navigation" className="space-y-2 py-6">
        {destinations.map(item => {
          const active = isActive(item.href, pathname, pastView);
          return <Link key={item.href} href={item.href} onClick={onClose} aria-current={active ? "page" : undefined} className={`flex min-h-14 items-center gap-4 rounded-xl px-4 py-3 text-base font-medium focus-visible:outline-2 focus-visible:outline-blue-600 ${active ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"}`}><NavIcon name={item.icon} />{lang === "hi" ? item.hi : item.en}{active && <span aria-hidden="true" className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-600" />}</Link>;
        })}
      </nav>
      <section aria-label={lang === "hi" ? "खाता और भाषा" : "Account and language"} className="mt-auto border-t border-slate-200 pt-5">
        <label className="flex items-center justify-between gap-3 text-sm text-slate-600">{lang === "hi" ? "भाषा" : "Language"}<select aria-label="Language" value={lang} onChange={e => setLang(e.target.value as "en" | "hi")} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3"><option value="en">English</option><option value="hi">हिंदी</option></select></label>
        <div className="mt-5 flex items-center gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold">{currentUser?.name?.slice(0, 1).toUpperCase() || "SR"}</span>
          <div className="min-w-0"><p className="text-xs text-slate-500">{lang === "hi" ? "खाता" : "Account"}</p><p className="break-words text-sm font-medium">{currentUser?.name || (lang === "hi" ? "साइन इन नहीं है" : "Not signed in")}</p></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="min-h-11 rounded-lg px-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => { onClose(); openProfileModal(); }}>{currentUser ? (lang === "hi" ? "प्रोफ़ाइल बदलें" : "Switch profile") : (lang === "hi" ? "प्रोफ़ाइल चुनें" : "Choose profile")}</button>
          {currentUser && <button type="button" className="min-h-11 rounded-lg px-2 text-sm text-slate-500 hover:bg-slate-50" onClick={() => { onClose(); void logout(); }}>{lang === "hi" ? "प्रोफ़ाइल छोड़ें" : "Leave profile"}</button>}
        </div>
      </section>
    </div>
  </dialog>;
}

export function SiteHeader() {
  const { lang } = useLang();
  const { kind } = useAttemptMode();
  const { currentUser } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="border-b border-slate-200 bg-white">
    <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-2 px-3 sm:px-6">
      <Link href={profileHome(currentUser)} aria-label="Score Recovery home" className="flex shrink-0 items-center gap-2 font-semibold text-slate-900">
        <span className="rounded-md bg-slate-900 px-1.5 py-1 text-xs text-white">SR</span>
        <span className="hidden lg:inline">Score Recovery</span>
      </Link>
      {kind === null ? <>
        <nav aria-label="Main" className="hidden flex-1 items-center justify-center gap-1 sm:flex"><Suspense fallback={null}><MainNavLinks variant="top" /></Suspense></nav>
        <button type="button" aria-expanded={menuOpen} aria-haspopup="dialog" aria-controls="app-navigation" onClick={() => setMenuOpen(true)} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>{lang === "hi" ? "मेन्यू" : "Menu"}</button>
        {menuOpen && <Suspense fallback={null}><NavigationDrawer onClose={() => setMenuOpen(false)} /></Suspense>}
      </> : <span className="text-sm text-slate-500">{lang === "hi" ? "एक बार में एक प्रश्न" : "One question at a time"}</span>}
    </div>
  </header>;
}
