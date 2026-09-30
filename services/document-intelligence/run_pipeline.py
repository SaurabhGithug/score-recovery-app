"""
Document Intelligence Pipeline CLI:
Main orchestration script executing Router -> Extraction -> Reconstruction -> Validation -> Provenance crops -> Branch Compatibility.
"""

import sys
import os
import json
import re
import argparse
from router import ParserRouter
from question_reconstructor import QuestionReconstructor
from validator import QuestionValidator
from crop_generator import CropGenerator

DISCIPLINE_KEYWORDS = {
    "civil": [
        "concrete", "cement", "rcc", "surveying", "hydraulics", "soil mechanics",
        "structural", "shear force", "bending moment", "reinforcement", "aggregate",
        "slump", "traverse", "truss", "highway", "pavement", "retaining wall"
    ],
    "electrical": [
        "transformer", "induction motor", "circuit", "alternator", "synchronous",
        "armature", "magnetic flux", "kirchhoff", "impedance", "semiconductor",
        "diode", "three phase", "transmission line", "capacitance", "inductor"
    ],
    "mechanical": [
        "thermodynamics", "entropy", "refrigeration", "carnot", "stress strain",
        "fluid mechanics", "ic engine", "flywheel", "gear train", "heat transfer",
        "boilers", "turbines", "lathe", "machining"
    ],
    "cse": [
        "data structures", "algorithms", "operating system", "sql", "dbms",
        "compiler", "microprocessor", "boolean logic", "cache memory", "binary tree"
    ]
}

def infer_document_discipline(text: str) -> str:
    text_lower = text.lower()
    scores = {}
    for disc, keywords in DISCIPLINE_KEYWORDS.items():
        score = sum(len(re.findall(r"\b" + re.escape(kw) + r"\b", text_lower)) for kw in keywords)
        scores[disc] = score

    best_disc = max(scores, key=scores.get)
    if scores[best_disc] >= 2:
        return best_disc
    return "general_aptitude"

def run_pipeline(
    file_path: str,
    doc_id: str,
    user_id: str,
    crops_dir: str,
    output_path: str,
    target_branch: str = None,
    context_name: str = None
):
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: {file_path}")

    print(f"[Pipeline] Starting extraction for doc_id={doc_id} path={file_path}")

    # 1. Routing & Extraction to CanonicalDocument
    router = ParserRouter()
    canonical_doc = router.route_and_parse(file_path, doc_id)
    print(f"[Pipeline] Parsed using {canonical_doc.parser_used}. Total pages: {len(canonical_doc.pages)}")

    # 2. Question Reconstruction
    reconstructor = QuestionReconstructor()
    candidate_questions = reconstructor.reconstruct(canonical_doc)
    print(f"[Pipeline] Reconstructed {len(candidate_questions)} candidate questions.")

    # 3. Deterministic Validation
    validator = QuestionValidator(confidence_threshold=0.85)
    validated_questions = []
    ready_count = 0
    review_count = 0

    # 4. Crop Generator for Provenance
    crop_gen = CropGenerator(crops_dir)
    rendered_pages = set()

    for q in candidate_questions:
        status, reason, final_conf = validator.validate(q, candidate_questions)
        q["verificationStatus"] = status
        q["reviewReason"] = reason
        q["extractionConfidence"] = round(final_conf, 2)
        q["userId"] = user_id
        q["documentId"] = doc_id

        # Generate page preview crop for provenance if needed
        src_page = q.get("sourcePage", 1)
        if src_page not in rendered_pages:
            crop_name = crop_gen.generate_page_preview(file_path, doc_id, src_page)
            rendered_pages.add(src_page)
            if crop_name:
                q["sourceImageCrop"] = crop_name
        else:
            q["sourceImageCrop"] = f"{doc_id}_p{src_page}.png"

        if status in ["AUTO_ACCEPTED", "VERIFIED"]:
            ready_count += 1
        else:
            review_count += 1

        validated_questions.append(q)

    # 5. Check Discipline / Branch Compatibility
    all_text = " ".join([p.raw_text or "" for p in canonical_doc.pages])
    inferred_disc = infer_document_discipline(all_text)
    compatibility = {"isCompatible": True, "inferredBranch": inferred_disc}

    if target_branch and target_branch != "general" and inferred_disc != "general_aptitude":
        if inferred_disc != target_branch:
            compatibility = {
                "isCompatible": False,
                "inferredBranch": inferred_disc,
                "targetBranch": target_branch,
                "warningMessage": f"This material appears to be {inferred_disc.capitalize()} Engineering, but your current preparation goal is {context_name or target_branch.capitalize()}."
            }

    # 6. Format Output
    output_data = {
        "documentId": doc_id,
        "userId": user_id,
        "parserUsed": canonical_doc.parser_used,
        "documentType": canonical_doc.document_type,
        "inferredBranch": inferred_disc,
        "branchCompatibility": compatibility,
        "pageCount": len(canonical_doc.pages),
        "questionsCount": len(validated_questions),
        "readyCount": ready_count,
        "reviewCount": review_count,
        "pages": [
            {
                "documentId": doc_id,
                "pageNumber": p.page_number,
                "rawText": p.raw_text,
                "markdown": p.markdown,
                "parser": p.parser,
                "confidence": p.confidence,
                "imagePath": p.image_path,
                "metadata": p.metadata
            }
            for p in canonical_doc.pages
        ],
        "questions": validated_questions
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    print(f"[Pipeline] Complete! Results written to {output_path}")

def main():
    parser = argparse.ArgumentParser(description="Document Intelligence Pipeline CLI")
    parser.add_argument("--input", required=True, help="Path to input study document")
    parser.add_argument("--doc-id", required=True, help="Study Document ID")
    parser.add_argument("--user-id", required=True, help="User ID")
    parser.add_argument("--crops-dir", required=True, help="Directory for provenance crops")
    parser.add_argument("--output", required=True, help="Path for JSON output")
    parser.add_argument("--target-branch", required=False, default=None, help="Target branch (e.g. civil)")
    parser.add_argument("--context-name", required=False, default=None, help="Preparation context name")

    args = parser.parse_args()
    try:
        run_pipeline(
            args.input,
            args.doc_id,
            args.user_id,
            args.crops_dir,
            args.output,
            args.target_branch,
            args.context_name
        )
    except Exception as e:
        print(f"[Pipeline ERROR] {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
