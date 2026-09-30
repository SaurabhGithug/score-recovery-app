"""
Deterministic Question Validation Engine:
Enforces 12 strict rules before questions are accepted into the Question Bank.
Flags uncertain, truncated, or malformed items for human review.
"""

import re
from typing import Dict, Any, Tuple, List

class QuestionValidator:
    def __init__(self, confidence_threshold: float = 0.85):
        self.confidence_threshold = confidence_threshold

    def validate(self, question: Dict[str, Any], all_questions: List[Dict[str, Any]]) -> Tuple[str, str, float]:
        """
        Validates candidate question according to 12 deterministic rules.
        Returns: (verification_status, review_reason, final_confidence)
        Status: 'AUTO_ACCEPTED' | 'NEEDS_REVIEW' | 'REJECTED'
        """
        flags: List[str] = []
        conf = float(question.get("confidence", 0.90))

        q_text = (question.get("questionText") or "").strip()
        options = question.get("options") or []
        correct_ans = question.get("correctAnswer")
        q_num = question.get("questionNumber")
        page_num = question.get("sourcePage")

        # Rule 1: Question text exists and is non-empty
        if not q_text:
            return "REJECTED", "Question text is completely empty", 0.0

        # Rule 2: Question is suspiciously short
        if len(q_text) < 12:
            flags.append("Suspiciously short question stem (< 12 characters)")
            conf -= 0.25

        # Rule 3: Truncation check (ends with abrupt conjunction, hyphen, or comma)
        if re.search(r"(\b(?:and|or|the|is|in|of|to)\s*$|[,-]\s*$)", q_text, re.I):
            flags.append("Question stem appears prematurely truncated")
            conf -= 0.20

        # Rule 4: MCQ has valid number of options
        q_type = question.get("type", "MCQ")
        if q_type == "MCQ":
            if len(options) < 2:
                flags.append("MCQ has fewer than 2 detected options")
                conf -= 0.35
            elif len(options) == 4:
                conf = min(1.0, conf + 0.05)
            elif len(options) > 5:
                flags.append("Suspicious option count (> 5 options)")
                conf -= 0.15

        # Rule 5: Options aren't identical or duplicate
        opt_texts = [o.get("text", "").strip().lower() for o in options]
        if len(opt_texts) != len(set(opt_texts)) and len(opt_texts) > 0:
            flags.append("Identical or duplicate option texts detected")
            conf -= 0.25

        # Rule 6: Correct answer references valid option key
        if correct_ans:
            valid_keys = [o.get("id") for o in options]
            if correct_ans not in valid_keys:
                flags.append(f"Correct answer '{correct_ans}' not found among options {valid_keys}")
                conf -= 0.20
        else:
            flags.append("Correct answer not found in source text or answer key")
            conf -= 0.10

        # Rule 7: Header/footer did not enter question text
        if re.search(r"(\bpage\s+\d+\b|\broll\s+no\b|\btest\s+booklet\b|\bdo\s+not\s+open\b)", q_text, re.I):
            flags.append("Header/footer or test instructions detected inside question text")
            conf -= 0.30

        # Rule 8: Question numbering is plausible
        if q_num is not None and (q_num <= 0 or q_num > 500):
            flags.append(f"Question numbering out of plausible range ({q_num})")
            conf -= 0.20

        # Rule 9: Source page number exists
        if not page_num or page_num <= 0:
            flags.append("Source page provenance missing")
            conf -= 0.15

        # Rule 10: Obvious duplicate question check in same paper
        duplicates = [
            q for q in all_questions
            if q is not question and q.get("questionText", "").strip().lower() == q_text.lower()
        ]
        if len(duplicates) > 0:
            flags.append("Identical question text already extracted elsewhere in document")
            conf -= 0.30

        # Rule 11: Option texts are not completely blank
        empty_opts = [o for o in options if not o.get("text", "").strip()]
        if len(empty_opts) > 0:
            flags.append(f"{len(empty_opts)} options have empty text")
            conf -= 0.30

        # Rule 12: Column bleed (contains sudden unrelated headers)
        if re.search(r"(\bsection\s+[A-D]\b.*\bsection\s+[A-D]\b)", q_text, re.I):
            flags.append("Possible multi-column text collision detected")
            conf -= 0.25

        final_conf = max(0.05, min(1.0, conf))

        # Determine verification status based on flags and confidence
        if final_conf < 0.50 or "Question text is completely empty" in flags:
            return "REJECTED", "; ".join(flags), final_conf

        if final_conf >= self.confidence_threshold and len(flags) == 0:
            return "AUTO_ACCEPTED", None, final_conf
        else:
            reason = "; ".join(flags) if flags else "Extraction confidence below auto-acceptance threshold"
            return "NEEDS_REVIEW", reason, final_conf
