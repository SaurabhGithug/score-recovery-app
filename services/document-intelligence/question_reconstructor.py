"""
Question Reconstruction Engine:
Reconstructs structured candidate questions (MCQ, options A-D, answers, sections)
from CanonicalDocument blocks.
"""

import re
from typing import List, Dict, Any, Optional, Tuple
from canonical import CanonicalDocument, CanonicalPage, CanonicalBlock

class QuestionReconstructor:
    def __init__(self):
        # Section detection keywords
        self.section_patterns = {
            "quant": re.compile(r"(quantitative\s+aptitude|mathematics|arithmetic|quant)", re.I),
            "reasoning": re.compile(r"(reasoning|general\s+intelligence|analytical)", re.I),
            "english": re.compile(r"(english\s+comprehension|general\s+english|english\s+language)", re.I),
            "gk": re.compile(r"(general\s+awareness|general\s+knowledge|gk|current\s+affairs)", re.I),
        }

    def reconstruct(self, doc: CanonicalDocument) -> List[Dict[str, Any]]:
        questions: List[Dict[str, Any]] = []
        current_subject = "General"

        # Pass 1: Extract answer key map if present on later pages
        answer_key_map = self._extract_answer_key_map(doc)

        # Pass 2: Extract questions page-by-page
        for page in doc.pages:
            page_text = page.raw_text or ""
            if not page_text.strip():
                continue

            # Update active section if header seen
            for sec_key, pattern in self.section_patterns.items():
                if pattern.search(page_text[:300]):
                    if sec_key == "quant":
                        current_subject = "Quantitative Aptitude"
                    elif sec_key == "reasoning":
                        current_subject = "Reasoning"
                    elif sec_key == "english":
                        current_subject = "English"
                    elif sec_key == "gk":
                        current_subject = "General Awareness"

            # Reconstruct questions from this page
            page_questions = self._extract_questions_from_page(page, current_subject, answer_key_map)
            questions.extend(page_questions)

        # Deduplicate if duplicate question numbers appear on adjacent pages
        seen_numbers = set()
        deduped = []
        for q in questions:
            qnum = q.get("questionNumber")
            if qnum is not None:
                if qnum in seen_numbers:
                    continue
                seen_numbers.add(qnum)
            deduped.append(q)

        return deduped

    def _extract_answer_key_map(self, doc: CanonicalDocument) -> Dict[int, str]:
        """Scans for answer keys e.g. '1. B 2. C' or 'Q1: A, Q2: D'."""
        key_map: Dict[int, str] = {}
        for page in doc.pages:
            text = page.raw_text or ""
            if re.search(r"(answer\s+key|solutions|answers)", text, re.I):
                matches = re.findall(r"(?:q(?:uestion)?\.?\s*)?(\d+)[\s.:\-]+([A-D])\b", text, re.I)
                for q_str, ans_str in matches:
                    key_map[int(q_str)] = ans_str.upper()
        return key_map

    def _extract_questions_from_page(
        self,
        page: CanonicalPage,
        subject: str,
        answer_key_map: Dict[int, str]
    ) -> List[Dict[str, Any]]:
        text = page.raw_text or ""
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

        questions: List[Dict[str, Any]] = []

        # Find question boundaries
        # Patterns: Q1. / Q.1 / 1. / 1) / Question 1:
        q_start_regex = re.compile(
            r"^(?:(?:Q(?:uestion)?[\s.:#]*(\d+))|(\d+)[\s.):])(?:\s+|$)(.*)",
            re.I
        )

        q_indices: List[Tuple[int, int, str]] = [] # (line_index, question_number, first_line_text)
        for i, line in enumerate(lines):
            m = q_start_regex.match(line)
            if m:
                q_num_str = m.group(1) or m.group(2)
                if q_num_str:
                    q_num = int(q_num_str)
                    rest = m.group(3) or ""
                    # Ensure it's not a page number or date like 2026.
                    if q_num < 500 and not line.lower().startswith("page"):
                        q_indices.append((i, q_num, rest))

        # If no explicit numbering, check if paragraph contains options (A), (B), (C), (D)
        if not q_indices:
            return self._extract_unsegmented_questions(text, page.page_number, subject, answer_key_map)

        for idx_pos, (start_idx, q_num, first_line_rest) in enumerate(q_indices):
            end_idx = q_indices[idx_pos + 1][0] if idx_pos + 1 < len(q_indices) else len(lines)
            q_lines = lines[start_idx:end_idx]

            parsed_q = self._parse_single_question_lines(
                q_lines=q_lines,
                q_num=q_num,
                page_num=page.page_number,
                subject=subject,
                answer_key_map=answer_key_map
            )
            if parsed_q:
                questions.append(parsed_q)

        return questions

    def _parse_single_question_lines(
        self,
        q_lines: List[str],
        q_num: int,
        page_num: int,
        subject: str,
        answer_key_map: Dict[int, str]
    ) -> Optional[Dict[str, Any]]:
        full_chunk = "\n".join(q_lines)

        # Option regex matching: (A) / A. / [A] / (a) / A)
        opt_pattern = re.compile(
            r"(?:^|\s|\n)(?:[\(\[]?([A-D])[\)\]\.:])\s+([^\n\(\[]+)",
            re.I
        )

        # Separate question stem from options
        # Find position of first option
        first_opt_match = opt_pattern.search(full_chunk)

        options: List[Dict[str, str]] = []
        stem = ""
        inline_answer = None

        if first_opt_match:
            stem_part = full_chunk[:first_opt_match.start()].strip()
            # Clean up leading question numbering from stem
            stem = re.sub(r"^(?:(?:Q(?:uestion)?[\s.:#]*\d+)|(?:\d+[\s.):]))\s*", "", stem_part, flags=re.I).strip()

            options_part = full_chunk[first_opt_match.start():]
            all_opts = opt_pattern.findall(options_part)

            seen_keys = set()
            for key, opt_text in all_opts:
                k = key.upper()
                clean_opt = opt_text.strip()
                # Remove trailing answer keys like "Ans: C"
                ans_match = re.search(r"(?:ans(?:wer)?|correct)[\s.:\-]+([A-D])", clean_opt, re.I)
                if ans_match:
                    inline_answer = ans_match.group(1).upper()
                    clean_opt = clean_opt[:ans_match.start()].strip()

                if k not in seen_keys and k in ["A", "B", "C", "D"]:
                    seen_keys.add(k)
                    options.append({"id": k, "text": clean_opt})
        else:
            # No options found; treats whole chunk as question stem
            stem = re.sub(r"^(?:(?:Q(?:uestion)?[\s.:#]*\d+)|(?:\d+[\s.):]))\s*", "", full_chunk, flags=re.I).strip()

        # Check for answer in the text if not found yet
        if not inline_answer:
            ans_m = re.search(r"(?:ans(?:wer)?|correct)[\s.:\-]+([A-D])\b", full_chunk, re.I)
            if ans_m:
                inline_answer = ans_m.group(1).upper()
            elif q_num in answer_key_map:
                inline_answer = answer_key_map[q_num]

        # Calculate preliminary confidence
        confidence = 0.95
        if len(options) == 4:
            confidence = 0.98
        elif len(options) >= 2:
            confidence = 0.88
        else:
            confidence = 0.70

        if not inline_answer:
            # Answer is missing; not necessarily an invalid question, but lower auto-acceptance confidence
            confidence -= 0.05

        if len(stem) < 15:
            confidence -= 0.20

        return {
            "questionNumber": q_num,
            "questionText": stem or f"Question {q_num}",
            "type": "MCQ" if len(options) >= 2 else "NUMERICAL",
            "options": options,
            "correctAnswer": inline_answer,
            "explanation": None,
            "subject": subject,
            "topic": None,
            "difficulty": 2,
            "sourcePage": page_num,
            "sourceBlockIds": [f"p{page_num}_q{q_num}"],
            "sourceBoundingBox": None,
            "sourceType": "EXTRACTED",
            "confidence": max(0.2, min(1.0, confidence))
        }

    def _extract_unsegmented_questions(
        self,
        text: str,
        page_num: int,
        subject: str,
        answer_key_map: Dict[int, str]
    ) -> List[Dict[str, Any]]:
        """Fallback when explicit numbering is subtle."""
        chunks = text.split("\n\n")
        results = []
        for idx, chunk in enumerate(chunks):
            if re.search(r"\([A-D]\)", chunk):
                parsed = self._parse_single_question_lines(
                    q_lines=chunk.splitlines(),
                    q_num=idx + 1,
                    page_num=page_num,
                    subject=subject,
                    answer_key_map=answer_key_map
                )
                if parsed and len(parsed.get("options", [])) >= 2:
                    results.append(parsed)
        return results
