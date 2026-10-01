import { citationIds, type StudyCitation } from '@/lib/study-evidence';

/** Evidence stays with the claim it is offered for, including in saved syllabus notes. */
export function ClaimSources({ text, evidence = [], showUncited = false }: { text: string; evidence?: StudyCitation[]; showUncited?: boolean }) {
  const ids = citationIds(text);
  if (!ids.length) return showUncited ? <p className="mt-2 text-[11px] text-slate-500">AI explanation · no supporting source attached</p> : null;
  return <div className="mt-2 space-y-2">
    {ids.map(id => {
      const source = evidence.find(e => e.id === id && e.stem.trim());
      if (!source) return <p key={id} className="text-xs text-amber-800">[{id}] Source unavailable · this citation cannot be checked.</p>;
      const url = source.sourceUrl && /^https?:\/\//i.test(source.sourceUrl) ? source.sourceUrl : null;
      return <details key={id} className="rounded-lg border border-blue-200 bg-blue-50/60 p-2.5 text-xs leading-5 text-slate-700">
        <summary className="cursor-pointer font-semibold text-blue-900">[{id}] {source.label}</summary>
        <p className="mt-2 whitespace-pre-line">{source.stem}</p>
        {url && <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold text-blue-700 underline">Open source ↗</a>}
        <p className="mt-1 text-[11px] text-slate-500">{source.questionId ? 'Stored question; its topic match is suggested. Check the excerpt supports this claim.' : 'Reference excerpt is a summary. Open the original to check the claim.'}</p>
      </details>;
    })}
  </div>;
}
