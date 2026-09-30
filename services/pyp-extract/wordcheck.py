"""Is the first token of an OCR'd line a whole word, or a fragment of one?

An OCR box that starts a few points inside the text cuts the first letters off every line
("t watering" / "st watering" / "rst watering" for "the first watering"). Both engines read
the same pixels, so they agree on the cut and agreement alone cannot catch it. A line whose
first token is not a word is therefore rejected.

A token is a word when it is (a) not lowercase-initial (digits, symbols, brackets, capitals and
proper nouns are not checked), (b) a common 1-2 letter word, or the single letter "a", or a
single-letter variable followed by an operator/number ("x = 2"), (c) in the system word list
(/usr/share/dict/words) with or without a regular inflection (-s, -es, -ed, -ing, -ly, ...),
or (d) in the civil-engineering / units vocabulary below. Anything else is a fragment.

The check cannot see a cut that happens to leave a real word ("elect" from "select", "he"
from "the"); the OCR boxes are padded on the left for that reason (digialm.parse_question).
"""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

SHORT = set("""a am an as at be by do go he if in is it me my no of on or so to up us we
ok ox oh ie eg vs""".split())

# domain words, units and names absent from the system word list (lowercase)
DOMAIN = set("""
aggregates prestressed prestressing pretensioning posttensioning chajja chajjas cumec cumecs
cusecs kn mpa gpa kpa pa mm cm km kg kgf hz rpm kw kva hp ft sq cu yd hr hrs min sec nos pcs
ml mg gm db lbs mld mgd bod cod ph tds tss ppm ppb ntu
manning mannings chezy chezys darcy darcys weisbach reynolds froude terzaghi rankine rankines
casagrande atterberg bernoulli bernoullis hazen kennedy kennedys lacey laceys khosla khoslas
bligh blighs lanes euler eulers mohr mohrs castigliano castiglianos macaulay macaulays
clapeyron clapeyrons boussinesq westergaard proctor proctors hooke hookes poisson poissons
young youngs kutter kutters dupuit theis thiem horton hortons penman thornthwaite
pozzolana pozzolanic pozzolanas flyash overhanging levelling kerb kerbs evapotranspiration
stirrups gabion gabions geotextile geotextiles geogrid geogrids formworks shutterings
bituminous bitumen bitumens macadam tarmac subgrade subgrades subbase sub-base basecourse
superelevation carriageway carriageways chainages theodolites tacheometric tacheometry
isohyets isohyetal hydrographs hyetograph hyetographs unitgraph
lintels plinths sills parapet parapets corbel corbels cornice cornices coping copings
headroom soffit soffits nosing nosings baluster balusters newel newels riser risers
underpinning dewatering wellpoint wellpoints cofferdam cofferdams caisson caissons
rcc pcc psc ssc ssb dpc gi ci ms hysd tmt opc ppc src hac lhc rhc sfrc frc hpc hsc scc
is irc bis astm ncc ibc nbc mort cpwd pwd
epoxy epoxies admixture admixtures plasticiser plasticisers plasticizer plasticizers
superplasticiser superplasticisers superplasticizer superplasticizers
slenderness torsional flexural shear-span doubly singly underreinforced overreinforced
ogee ogees spillways aqueducts barrages weirs culverts canals sluiceway sluiceways
teflon terracotta stagflation cytidine uridine veena ghatam verandah verandahs bio biogas
""".split())

# common words the 1934 Webster list (web2) lacks
COMMON = set("""has does goes was were been being had having done its it's they them their there
these those this that than then what which who whom whose where when while why how also into onto
upon within without per via etc""".split())

PREFIXES = ("co", "bi", "non", "re", "pre", "sub", "semi", "multi", "anti", "inter", "micro", "macro", "bio",
            "geo", "hydro", "over", "under", "self", "post", "un", "de", "mis", "tri", "uni", "poly")

BRITISH = [(r"tre$", "ter"), (r"tres$", "ters"), (r"bre$", "ber"), (r"bres$", "bers"), (r"our$", "or"), (r"ours$", "ors"), (r"oured$", "ored"),
           (r"isation$", "ization"), (r"isations$", "izations"), (r"ise$", "ize"), (r"ised$", "ized"),
           (r"ising$", "izing"), (r"yse$", "yze"), (r"ogue$", "og"), (r"^sy", "si"), (r"ae", "e"), (r"oe", "e")]

ROMAN = re.compile(r"^\(?(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)[.)\-,:]", re.I)

CORPUS = Path(__file__).resolve().parent / "vocab_corpus.txt"

SUFFIXES = ("ings", "ing", "edly", "ed", "es", "s", "ly", "er", "ers", "est", "ness", "ment", "ments",
            "al", "ally", "ity", "ities", "ive", "ation", "ations", "ise", "ised", "ize", "ized", "d")

OPERATORS = re.compile(r"^[=+\-*/×÷^<>≤≥≠±()\[\]0-9.,:;%]")


@lru_cache(maxsize=1)
def words() -> frozenset:
    out = set()
    for f in ("/usr/share/dict/words", "/usr/share/dict/web2"):
        p = Path(f)
        if p.exists():
            out.update(w.strip().lower() for w in p.read_text(errors="ignore").splitlines() if len(w.strip()) >= 3)
            break
    return frozenset(out)


@lru_cache(maxsize=1)
def corpus() -> frozenset:
    """Words the papers print in their own text layers (see build_corpus)."""
    if not CORPUS.exists():
        return frozenset()
    return frozenset(w.strip() for w in CORPUS.read_text().splitlines() if w.strip() and not w.startswith("#"))


def _known(w: str, depth: int = 0) -> bool:
    if w in DOMAIN or w in SHORT or w in COMMON or w in corpus():
        return True
    if len(w) < 3:
        return False
    ws = words()
    if w in ws:
        return True
    if depth == 0:
        for rx, rep in BRITISH:
            v = re.sub(rx, rep, w)
            if v != w and _known(v, 1):
                return True
        for pre in PREFIXES:
            if w.startswith(pre) and len(w) - len(pre) >= 3 and _known(w[len(pre):], 1):
                return True
        for k in range(3, len(w) - 2):  # closed compounds: "rockfill", "wavelength"
            if w[:k] in ws and _known(w[k:], 1) and len(w[k:]) >= 3:
                return True
    for suf in SUFFIXES:
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            stem = w[: -len(suf)]
            if stem in ws or stem + "e" in ws or stem in DOMAIN:
                return True
            if len(stem) >= 4 and stem[-1] == stem[-2] and stem[:-1] in ws:  # "levelling" -> "level"
                return True
            if stem.endswith("i") and stem[:-1] + "y" in ws:  # "studies" -> "study"
                return True
    return False


def is_fragment(line: str) -> str | None:
    """The first token of `line` when it is a word fragment, else None."""
    toks = line.split()
    if not toks:
        return None
    tok = toks[0]
    if tok.lower() in ("e.g.", "e.g.,", "i.e.", "i.e.,", "etc.", "viz.", "viz.,", "w.r.t.", "c/c", "c/s"):
        return None
    if "/" in tok and re.search(r"\d", tok):
        return None  # a formula: "td/4p", "span/350"
    if ROMAN.match(tok) or re.fullmatch(r"\(?(i|ii|iii|iv|v|vi|vii|viii|ix|x)\)?", tok, re.I):
        return None  # list numbering "ii." / "(iv)"
    core = re.sub(r"[’'`]s$", "", tok)
    core = re.sub(r"[^\w\-]+$", "", core)
    if not core or not core[0].isalpha() or not core[0].islower():
        return None  # capitals, digits, symbols, brackets, quotes: not checked
    if not core.isascii():
        return None
    if re.fullmatch(r"[a-f]{4,6}", core) and len(set(core)) == len(core):
        return None  # an order of labelled items: "abcde", "badec"
    if len(core) == 1:
        if core == "a":
            return None
        nxt = toks[1] if len(toks) > 1 else ""
        if not nxt or OPERATORS.match(nxt) or tok != core:
            return None  # a variable: "x = 2", "b/d", "k)"
        return tok
    parts = [x for x in re.split(r"[-/]", core) if x]
    if len(parts) > 1 or "/" in tok:
        # "consonants/vowels", "d/2", "span/350", "kN/m2", "co-efficient": every part a word,
        # a number or a one-letter symbol
        ok = all(_known(x.lower()) or x.lower() in PREFIXES or re.fullmatch(r"[\d.]+|[A-Za-z]\d*|[A-Za-z]{1,3}\d+", x) for x in
                 re.split(r"[-/]", re.sub(r"[^\w\-/.]+$", "", tok)) if x)
        return None if ok else tok
    if re.search(r"\d", core):
        return None  # "m3", "t2": symbols with indices
    return None if _known(core.lower()) else tok


def build_corpus(pdfs) -> list[str]:
    """Lowercase words of >= 5 letters printed >= 3 times in the source PDFs' text layers,
    minus any word that is the tail of another corpus word (a text layer that lost a ligature
    prints "nished" for "finished"; such tails must not become words)."""
    import collections

    import pdfplumber

    cnt = collections.Counter()
    for pdf in pdfs:
        with pdfplumber.open(str(pdf)) as doc:
            for page in doc.pages:
                for w in page.extract_words(x_tolerance=1.5):
                    for t in re.findall(r"[A-Za-z]+", w["text"]):
                        if len(t) >= 5:
                            cnt[t.lower()] += 1
    common = sorted(w for w, c in cnt.items() if c >= 3)
    tails = set()
    by_len = sorted(common, key=len, reverse=True)
    allw = set(common)
    for w in by_len:
        for k in range(1, len(w) - 4):
            if w[k:] in allw:
                tails.add(w[k:])
    ws = words()
    return [w for w in common if w not in tails and w not in ws]


if __name__ == "__main__":  # python3 services/pyp-extract/wordcheck.py  -> rebuild vocab_corpus.txt
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from common import SOURCES

    pdfs = sorted(list((SOURCES / "careerpower").glob("*.pdf")) + list((SOURCES / "adda247").glob("*.pdf")))
    vocab = build_corpus(pdfs)
    CORPUS.write_text("# built by wordcheck.py from the source PDFs' text layers; do not edit\n" + "\n".join(vocab) + "\n")
    print(len(vocab), "words ->", CORPUS)
