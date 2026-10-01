"use client";

import Link from "next/link";
import { useState } from "react";
import { mergeTestbookImports, migrateLegacyTestbookStorage, parseTestbookImport, TESTBOOK_IMPORT_STORAGE_KEY, TESTBOOK_TRAINING_STORAGE_KEY } from "@/lib/testbook";
import { useUser } from "@/lib/user-context";
import { BankApiRequestError, importTestbookToServer } from "@/components/bank/api";
import type { BankTestbookImportResult } from "@/lib/bank/api-types";

function describeServerResult(result: BankTestbookImportResult): string {
  return `Saved: ${result.questions} question${result.questions === 1 ? "" : "s"} across ${result.paperIds.length} paper${result.paperIds.length === 1 ? "" : "s"} (${result.keyed} with answer keys, ${result.heldOut} kept out of practice because their answers need checking).`;
}

export default function TestbookImportPage() {
  const { currentUser, openProfileModal } = useUser();
  const [payload, setPayload] = useState("");
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [serverMessage, setServerMessage] = useState("");
  const [serverError, setServerError] = useState("");
  const [serverSyncing, setServerSyncing] = useState(false);
  const [copySyncing, setCopySyncing] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [copyError, setCopyError] = useState("");
  const [ownsLegacy, setOwnsLegacy] = useState(false);

  async function syncToServer(data: unknown) {
    setServerSyncing(true);
    setServerMessage("");
    setServerError("");
    try {
      const result = await importTestbookToServer(data);
      setServerMessage(describeServerResult(result));
    } catch (error) {
      setServerError(
        error instanceof BankApiRequestError
          ? `Server sync failed (${error.status}): ${error.message}`
          : "Server sync failed: could not reach the bank import endpoint."
      );
    } finally {
      setServerSyncing(false);
    }
  }

  async function importPayload() {
    setSaved(false);
    setServerMessage("");
    setServerError("");
    try {
      const parsed = parseTestbookImport(JSON.parse(payload) as unknown);
      const storageKey = currentUser
        ? migrateLegacyTestbookStorage(TESTBOOK_IMPORT_STORAGE_KEY, currentUser.id)
        : TESTBOOK_IMPORT_STORAGE_KEY;
      const previousRaw = window.localStorage.getItem(storageKey);
      const previous = previousRaw ? parseTestbookImport(JSON.parse(previousRaw) as unknown) : null;
      const merged = mergeTestbookImports(previous, parsed);
      window.localStorage.setItem(storageKey, JSON.stringify(merged));
      window.dispatchEvent(new Event("testbook-import-changed"));
      const questions = parsed.tests.reduce((sum, test) => sum + test.questions.length, 0);
      setMessage(`Validated ${questions} portal questions. The bank now contains ${merged.tests.length} test capture${merged.tests.length === 1 ? "" : "s"}.${currentUser ? "" : " Choose a profile and explicitly confirm ownership here to attach this staged bank."}`);
      setSaved(true);
      // Local import kept intact regardless of whether the server sync below succeeds.
      if (currentUser) {
        await syncToServer(parsed);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The import could not be read.");
    }
  }

  async function copyBrowserBankToServer() {
    setCopyMessage("");
    setCopyError("");
    setCopySyncing(true);
    try {
      if (currentUser && ownsLegacy) {
        migrateLegacyTestbookStorage(TESTBOOK_IMPORT_STORAGE_KEY, currentUser.id, true);
        migrateLegacyTestbookStorage(TESTBOOK_TRAINING_STORAGE_KEY, currentUser.id, true);
        window.dispatchEvent(new Event("testbook-import-changed"));
      }
      const storageKey = currentUser
        ? migrateLegacyTestbookStorage(TESTBOOK_IMPORT_STORAGE_KEY, currentUser.id)
        : TESTBOOK_IMPORT_STORAGE_KEY;
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setCopyError("No browser bank found on this device yet — import one above first.");
        return;
      }
      const existing = parseTestbookImport(JSON.parse(raw) as unknown);
      const result = await importTestbookToServer(existing);
      setCopyMessage(describeServerResult(result));
    } catch (error) {
      setCopyError(
        error instanceof BankApiRequestError
          ? `Server sync failed (${error.status}): ${error.message}`
          : error instanceof Error
            ? error.message
            : "Could not copy the browser bank to the server."
      );
    } finally {
      setCopySyncing(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-14">
      <p className="text-sm text-slate-500">SSC JE · Civil Engineering</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Import your questions</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">Bring your saved Testbook captures into your learning bank.</p>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Use captures from this browser</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Sync questions you have already imported. Your captures stay attached to your account.</p>
        {currentUser ? <>
          <button type="button" onClick={copyBrowserBankToServer} disabled={copySyncing} className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
            {copySyncing ? "Syncing…" : "Sync my questions"}
          </button>
          <details className="mt-5 text-sm text-slate-600">
            <summary className="cursor-pointer">Looking for older captures?</summary>
            <label className="mt-3 flex items-start gap-2 leading-6"><input type="checkbox" checked={ownsLegacy} onChange={e=>setOwnsLegacy(e.target.checked)} className="mt-1.5"/><span>I confirm that unowned captures and practice history on this device belong to me. Include them when I sync. Existing account data is not overwritten.</span></label>
          </details>
        </> : <button type="button" onClick={openProfileModal} className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700">Choose profile to sync</button>}
        {copyMessage && <p role="status" className="mt-4 text-sm text-emerald-800">{copyMessage}</p>}
        {copyError && <p role="alert" className="mt-4 text-sm text-rose-700">{copyError}</p>}
      </section>

      <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-6">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">Import a new capture (JSON)</summary>
        <p className="mt-4 text-sm leading-6 text-slate-600">Paste a structured SSC JE Civil capture below. Do not paste API keys here; keys belong in the server’s .env.local file.</p>
        {!currentUser && <p className="mt-3 text-sm text-amber-800">Before choosing a profile, captures stay on this browser without an owner. Choose Civil or Mechanical and confirm ownership above to attach them.</p>}
        <label className="mt-4 block text-sm font-medium text-slate-700">Capture data
          <textarea aria-label="Structured portal capture" value={payload} onChange={event=>setPayload(event.target.value)} rows={8} spellCheck={false} className="mt-2 block w-full rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-xs leading-6 text-slate-800" placeholder='{"schemaVersion":1,"source":{"provider":"Testbook",...}}'/>
        </label>
        <button type="button" onClick={importPayload} disabled={!payload.trim()||serverSyncing} className="mt-4 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Validate and import</button>
      </details>

      {message && <p role={saved ? "status" : "alert"} className={"mt-4 text-sm leading-6 " + (saved ? "text-emerald-800" : "text-rose-700")}>{message}</p>}
      {serverSyncing && <p role="status" className="mt-3 text-sm text-slate-600">Syncing questions to your account…</p>}
      {serverMessage && <p role="status" className="mt-3 text-sm text-emerald-800">{serverMessage}</p>}
      {serverError && <p role="alert" className="mt-3 text-sm text-rose-700">{serverError}</p>}
      <div className="mt-7 flex flex-wrap gap-6 text-sm text-slate-600">
        <Link href="/learn" className="underline underline-offset-4">Back to learning</Link>
        {(saved||copyMessage) && <Link href="/papers" className="underline underline-offset-4">View imported papers</Link>}
      </div>
    </div>
  );
}
