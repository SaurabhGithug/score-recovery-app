"""
Native Document Parsers for Digital PDF, DOCX, PPTX, and XLSX files.
Does not perform unnecessary OCR if clean digital text exists.
"""

import os
import re
import zipfile
import xml.etree.ElementTree as ET
from typing import List, Optional, Tuple
from canonical import CanonicalDocument, CanonicalPage, CanonicalBlock

class NativePdfParser:
    """Extracts text and layout blocks from digital PDFs using pypdfium2."""

    def can_handle(self, file_path: str) -> bool:
        return file_path.lower().endswith(".pdf")

    def inspect_pdf_text_quality(self, file_path: str) -> Tuple[bool, int, float]:
        """
        Inspects whether PDF has good embedded digital text.
        Returns: (has_good_text, page_count, avg_chars_per_page)
        """
        import pypdfium2 as pdfium

        doc = pdfium.PdfDocument(file_path)
        page_count = len(doc)
        if page_count == 0:
            return False, 0, 0.0

        sample_pages = min(page_count, 5)
        total_chars = 0
        for i in range(sample_pages):
            page = doc[i]
            text = page.get_textpage().get_text_range()
            total_chars += len(text.strip())

        avg_chars = total_chars / max(1, sample_pages)
        # If average chars > 50 per page, it is very likely a digital PDF
        has_good_text = avg_chars > 50
        return has_good_text, page_count, avg_chars

    def parse(self, file_path: str, doc_id: str) -> CanonicalDocument:
        import pypdfium2 as pdfium

        doc = pdfium.PdfDocument(file_path)
        pages: List[CanonicalPage] = []

        for page_idx in range(len(doc)):
            page_num = page_idx + 1
            page = doc[page_idx]
            raw_text = page.get_textpage().get_text_range()
            width, height = page.get_size()

            blocks: List[CanonicalBlock] = []
            # Split lines into semantic blocks
            lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]

            current_block_text = []
            block_idx = 0

            for line in lines:
                # Detect header/footer
                is_header = bool(re.match(r"^(page\s+\d+|\d+\s+of\s+\d+|isro\s+|ssc\s+|section\s+[a-d])", line, re.I))
                if is_header and len(line) < 60:
                    blocks.append(CanonicalBlock(
                        id=f"p{page_num}_b{block_idx}",
                        type="HEADER",
                        text=line,
                        confidence=0.98,
                        parser="native_pdf",
                        metadata={"line_number": block_idx}
                    ))
                    block_idx += 1
                    continue

                # Question stem detection
                is_question_start = bool(re.match(r"^(?:q(?:uestion)?[\s.:#]*\d+|\d+[\s.):])\s+", line, re.I))
                if is_question_start:
                    if current_block_text:
                        blocks.append(CanonicalBlock(
                            id=f"p{page_num}_b{block_idx}",
                            type="TEXT",
                            text=" ".join(current_block_text),
                            confidence=0.95,
                            parser="native_pdf"
                        ))
                        block_idx += 1
                        current_block_text = []

                current_block_text.append(line)

            if current_block_text:
                blocks.append(CanonicalBlock(
                    id=f"p{page_num}_b{block_idx}",
                    type="TEXT",
                    text=" ".join(current_block_text),
                    confidence=0.95,
                    parser="native_pdf"
                ))

            pages.append(CanonicalPage(
                page_number=page_num,
                blocks=blocks,
                raw_text=raw_text,
                markdown=raw_text,
                parser="native_pdf",
                confidence=0.96,
                metadata={"width": width, "height": height}
            ))

        # Detect document type
        all_text = " ".join([p.raw_text or "" for p in pages])
        doc_type = "QUESTION_PAPER" if re.search(r"(marks|question|q\.\s*\d+|negative\s+marking)", all_text, re.I) else "NOTES"

        return CanonicalDocument(
            document_id=doc_id,
            pages=pages,
            parser_used="native_pdf",
            document_type=doc_type,
            metadata={"page_count": len(pages)}
        )

class NativeDocxParser:
    """Extracts text from DOCX files by parsing XML structure."""

    def can_handle(self, file_path: str) -> bool:
        return file_path.lower().endswith(".docx")

    def parse(self, file_path: str, doc_id: str) -> CanonicalDocument:
        blocks: List[CanonicalBlock] = []
        raw_lines = []
        block_idx = 0

        with zipfile.ZipFile(file_path) as z:
            xml_content = z.read("word/document.xml")
            tree = ET.fromstring(xml_content)
            # Namespace for Word
            ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

            for p in tree.iterfind(".//w:p", ns):
                texts = [node.text for node in p.iterfind(".//w:t", ns) if node.text]
                p_text = "".join(texts).strip()
                if p_text:
                    raw_lines.append(p_text)
                    blocks.append(CanonicalBlock(
                        id=f"p1_b{block_idx}",
                        type="TEXT",
                        text=p_text,
                        confidence=1.0,
                        parser="native_docx"
                    ))
                    block_idx += 1

        raw_text = "\n".join(raw_lines)
        page = CanonicalPage(
            page_number=1,
            blocks=blocks,
            raw_text=raw_text,
            markdown=raw_text,
            parser="native_docx",
            confidence=1.0
        )

        return CanonicalDocument(
            document_id=doc_id,
            pages=[page],
            parser_used="native_docx",
            document_type="NOTES",
            metadata={"page_count": 1}
        )

class NativePptxParser:
    """Extracts text slide-by-slide from PPTX files."""

    def can_handle(self, file_path: str) -> bool:
        return file_path.lower().endswith(".pptx")

    def parse(self, file_path: str, doc_id: str) -> CanonicalDocument:
        pages: List[CanonicalPage] = []
        with zipfile.ZipFile(file_path) as z:
            slide_files = sorted([f for f in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml", f)])
            ns = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}

            for idx, sfile in enumerate(slide_files):
                page_num = idx + 1
                xml_content = z.read(sfile)
                tree = ET.fromstring(xml_content)
                texts = [node.text for node in tree.iterfind(".//a:t", ns) if node.text]
                slide_text = "\n".join(texts).strip()

                blocks = [
                    CanonicalBlock(
                        id=f"p{page_num}_b0",
                        type="TEXT",
                        text=slide_text,
                        confidence=1.0,
                        parser="native_pptx"
                    )
                ]

                pages.append(CanonicalPage(
                    page_number=page_num,
                    blocks=blocks,
                    raw_text=slide_text,
                    markdown=slide_text,
                    parser="native_pptx",
                    confidence=1.0
                ))

        return CanonicalDocument(
            document_id=doc_id,
            pages=pages,
            parser_used="native_pptx",
            document_type="NOTES",
            metadata={"page_count": len(pages)}
        )

class NativeXlsxParser:
    """Extracts questions and rows from XLSX files."""

    def can_handle(self, file_path: str) -> bool:
        return file_path.lower().endswith(".xlsx")

    def parse(self, file_path: str, doc_id: str) -> CanonicalDocument:
        # Simple extraction from shared strings and sheet rows
        lines = []
        with zipfile.ZipFile(file_path) as z:
            shared_strings = []
            if "xl/sharedStrings.xml" in z.namelist():
                tree = ET.fromstring(z.read("xl/sharedStrings.xml"))
                ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
                for t in tree.iterfind(".//s:t", ns):
                    if t.text:
                        shared_strings.append(t.text.strip())

            lines = [s for s in shared_strings if s]

        raw_text = "\n".join(lines)
        page = CanonicalPage(
            page_number=1,
            blocks=[CanonicalBlock(id="p1_b0", type="TEXT", text=raw_text, confidence=1.0, parser="native_xlsx")],
            raw_text=raw_text,
            markdown=raw_text,
            parser="native_xlsx",
            confidence=1.0
        )

        return CanonicalDocument(
            document_id=doc_id,
            pages=[page],
            parser_used="native_xlsx",
            document_type="QUESTION_BANK" if "question" in raw_text.lower() else "NOTES",
            metadata={"page_count": 1}
        )

class NativeTxtParser:
    """Extracts text from plain text notes."""

    def can_handle(self, file_path: str) -> bool:
        return file_path.lower().endswith(".txt")

    def parse(self, file_path: str, doc_id: str) -> CanonicalDocument:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            raw_text = f.read()

        lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
        blocks = [
            CanonicalBlock(id=f"p1_b{i}", type="TEXT", text=l, confidence=1.0, parser="native_txt")
            for i, l in enumerate(lines)
        ]

        page = CanonicalPage(
            page_number=1,
            blocks=blocks,
            raw_text=raw_text,
            markdown=raw_text,
            parser="native_txt",
            confidence=1.0
        )

        return CanonicalDocument(
            document_id=doc_id,
            pages=[page],
            parser_used="native_txt",
            document_type="QUESTION_BANK" if ("q1" in raw_text.lower() or "question" in raw_text.lower()) else "NOTES",
            metadata={"page_count": 1}
        )

