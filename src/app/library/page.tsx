"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useUser } from "@/lib/user-context";
import { useLang } from "@/lib/i18n";

interface StudyDocument {
  id: string;
  user_id: string;
  preparation_context_id: string | null;
  original_name: string;
  mime_type: string;
  file_size_bytes: number;
  document_type: string;
  extraction_status: "UPLOADED" | "QUEUED" | "PROCESSING" | "READY" | "PARTIAL" | "FAILED";
  status_message: string | null;
  parser_used: string | null;
  page_count: number;
  questions_count: number;
  ready_questions_count: number;
  review_questions_count: number;
  metadata?: string | Record<string, unknown>;
  created_at: string;
}

export default function MyLibraryPage() {
  const {
    currentUser,
    openProfileModal,
    activeContext,
    switchContext,
    allContexts,
    openOnboardingModal,
  } = useUser();
  const { t } = useLang();
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    if (!currentUser) return;
    try {
      const url = activeContext?.id
        ? `/api/documents?contextId=${encodeURIComponent(activeContext.id)}`
        : "/api/documents";
      const res = await fetch(url, {
        headers: {
          "x-user-id": currentUser.id,
          ...(activeContext?.id ? { "x-context-id": activeContext.id } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, activeContext]);

  useEffect(() => {
    fetchDocuments();
    const handleContextChange = () => fetchDocuments();
    window.addEventListener("preparation-context-changed", handleContextChange);
    return () => window.removeEventListener("preparation-context-changed", handleContextChange);
  }, [fetchDocuments]);

  // Polling for processing documents
  useEffect(() => {
    const hasProcessing = documents.some(
      (d) => d.extraction_status === "QUEUED" || d.extraction_status === "PROCESSING"
    );
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      fetchDocuments();
    }, 2000);

    return () => clearInterval(interval);
  }, [documents, fetchDocuments]);

  async function handleFileUpload(file: File) {
    if (!currentUser) {
      openProfileModal();
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);
    if (activeContext?.id) {
      formData.append("contextId", activeContext.id);
    }

    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: {
          "x-user-id": currentUser.id,
          ...(activeContext?.id ? { "x-context-id": activeContext.id } : {}),
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      await fetchDocuments();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }

  async function handleDelete(docId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Are you sure you want to remove this document from your library?")) return;

    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "DELETE",
        headers: { "x-user-id": currentUser?.id || "" },
      });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            {t({ en: "My Library", hi: "मेरी लाइब्रेरी" })}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t({
              en: "Turn your study material into practice.",
              hi: "अपनी अध्ययन सामग्री को अभ्यास में बदलें।",
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeContext && (
            <button
              type="button"
              onClick={openOnboardingModal}
              className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 shadow-xs hover:bg-blue-100 transition"
            >
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              <span>Target: <strong>{activeContext.name}</strong> ▾</span>
            </button>
          )}
          {currentUser && (
            <button
              type="button"
              onClick={openProfileModal}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 shadow-xs hover:bg-slate-50 transition"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Profile: <strong>{currentUser.name}</strong> ▾</span>
            </button>
          )}
        </div>
      </div>

      {/* Upload Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition ${
          dragOver
            ? "border-blue-500 bg-blue-50/50"
            : "border-slate-300 bg-white hover:border-slate-400"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileUpload(e.target.files[0]);
            }
          }}
        />

        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl text-blue-600">
          📁
        </div>

        <h3 className="text-base font-bold text-slate-900 sm:text-lg">
          {isUploading ? "Uploading & Analyzing..." : "Drop study material here"}
        </h3>

        <p className="mt-1 text-xs text-slate-500 max-w-sm">
          PDF · Word · PowerPoint · Excel · Images<br />
          Books · Scans · Handwritten Notes
        </p>

        <div className="mt-5">
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {isUploading ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Processing...</span>
              </>
            ) : (
              <span>Choose File</span>
            )}
          </button>
        </div>

        {uploadError && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600 border border-red-200">
            {uploadError}
          </div>
        )}
      </div>

      {/* Documents List */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-900">
          {t({ en: "Uploaded Materials", hi: "अपलोड की गई अध्ययन सामग्री" })}{" "}
          <span className="text-xs font-normal text-slate-500">({documents.length})</span>
        </h2>

        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-400">
            Loading your study materials...
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No materials uploaded yet. Drop a PDF or notes file above to extract questions.
          </div>
        ) : (
          <div className="grid gap-3.5">
            {documents.map((doc) => {
              const isProcessing =
                doc.extraction_status === "QUEUED" || doc.extraction_status === "PROCESSING";
              const isFailed = doc.extraction_status === "FAILED";
              const isReady = doc.extraction_status === "READY" || doc.extraction_status === "PARTIAL";

              let branchCompat: {
                isCompatible: boolean;
                inferredBranch?: string;
                targetBranch?: string;
                warningMessage?: string;
              } | null = null;
              if (typeof doc.metadata === "string") {
                try {
                  const parsed = JSON.parse(doc.metadata);
                  branchCompat = parsed.branchCompatibility || null;
                } catch {
                  // ignore
                }
              } else if (doc.metadata && typeof doc.metadata === "object") {
                branchCompat = (doc.metadata as Record<string, unknown>).branchCompatibility as typeof branchCompat;
              }
              const showBranchWarning =
                branchCompat && branchCompat.isCompatible === false && !dismissedWarnings.has(doc.id);

              return (
                <div
                  key={doc.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-slate-300"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-base font-bold text-slate-700">
                        {doc.original_name.endsWith(".pdf") ? "📄" : "📝"}
                      </div>
                      <div>
                        <Link
                          href={`/library/${doc.id}`}
                          className="font-bold text-slate-900 hover:text-blue-600 transition line-clamp-1"
                        >
                          {doc.original_name}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {doc.page_count > 0 && <span>{doc.page_count} pages</span>}
                          <span>•</span>
                          <span>{(doc.file_size_bytes / (1024 * 1024)).toFixed(1)} MB</span>
                          <span>•</span>
                          <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                          {doc.parser_used && (
                            <>
                              <span>•</span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                {doc.parser_used}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {isReady && doc.questions_count > 0 && (
                        <>
                          <Link
                            href={`/library/${doc.id}/practice`}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
                          >
                            Practice ({doc.ready_questions_count})
                          </Link>
                          {doc.review_questions_count > 0 && (
                            <Link
                              href={`/library/${doc.id}/review`}
                              className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition"
                            >
                              Review ({doc.review_questions_count})
                            </Link>
                          )}
                        </>
                      )}

                      {isReady && doc.questions_count === 0 && (
                        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                          Learning Material
                        </span>
                      )}

                      <Link
                        href={`/library/${doc.id}`}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                      >
                        Details
                      </Link>

                      <button
                        type="button"
                        onClick={(e) => handleDelete(doc.id, e)}
                        className="text-slate-400 hover:text-red-600 p-1 transition"
                        title="Delete document"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Processing Status Banner */}
                  {isProcessing && (
                    <div className="mt-3.5 rounded-lg border border-blue-100 bg-blue-50/70 p-3">
                      <div className="flex items-center justify-between text-xs text-blue-900 font-medium mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />
                          <span>{doc.status_message || "Processing document..."}</span>
                        </div>
                        <span className="text-[11px] text-blue-700">Analyzing</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-200/60">
                        <div className="h-full bg-blue-600 animate-pulse w-3/4 rounded-full" />
                      </div>
                    </div>
                  )}

                  {/* Failed Status */}
                  {isFailed && (
                    <div className="mt-3.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                      <strong>Extraction Error:</strong> {doc.status_message || "Failed to parse document"}
                    </div>
                  )}

                  {/* Question stats pills */}
                  {isReady && doc.questions_count > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                      <span className="font-medium text-slate-900">
                        {doc.questions_count} questions found:
                      </span>
                      <span className="text-emerald-700 font-medium">
                        ✓ {doc.ready_questions_count} Ready
                      </span>
                      {doc.review_questions_count > 0 && (
                        <span className="text-amber-700 font-medium">
                          ⚠ {doc.review_questions_count} Need review
                        </span>
                      )}
                    </div>
                  )}

                  {/* Branch Mismatch Compatibility Warning Banner */}
                  {showBranchWarning && (
                    <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/90 p-3.5 text-xs text-amber-900 shadow-xs">
                      <div className="flex items-start gap-2.5">
                        <span className="text-base leading-none mt-0.5">⚠️</span>
                        <div className="flex-1 space-y-1.5">
                          <p className="font-bold text-amber-900">
                            {branchCompat?.warningMessage ||
                              `This material appears to be ${(branchCompat?.inferredBranch || "").toUpperCase()} Engineering, but your current preparation goal is ${activeContext?.name || "different"}.`}
                          </p>
                          <p className="text-amber-700">
                            Practicing out-of-discipline material may dilute your exam-specific score recovery metrics.
                          </p>
                          <div className="flex flex-wrap gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                const matching = allContexts.find(
                                  (c) =>
                                    c.branch?.toLowerCase() === branchCompat?.inferredBranch?.toLowerCase() ||
                                    c.name.toLowerCase().includes(branchCompat?.inferredBranch?.toLowerCase() || "")
                                );
                                if (matching) {
                                  switchContext(matching.id);
                                } else {
                                  openOnboardingModal();
                                }
                              }}
                              className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-amber-800 transition"
                            >
                              Switch Preparation Goal
                            </button>
                            <button
                              type="button"
                              onClick={() => setDismissedWarnings((prev) => new Set(prev).add(doc.id))}
                              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition"
                            >
                              Import Here Anyway
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
