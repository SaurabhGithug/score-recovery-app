"""
Parser Router: Selects the least destructive and highest-quality extraction path.
1. Native structured files (DOCX, PPTX, XLSX) -> Native parsers.
2. Digital PDF with good embedded text -> Native PDF parser.
3. Printed/scanned PDF or book -> MinerU (with graceful fallback).
4. Handwritten page / photographed notes -> PaddleOCR-VL.
"""

import os
from typing import Tuple
from canonical import CanonicalDocument
from native_parser import NativePdfParser, NativeDocxParser, NativePptxParser, NativeXlsxParser, NativeTxtParser
from mineru_adapter import MinerUAdapter, MinerUUnavailableError
from paddle_adapter import PaddleOCRVLAdapter

class ParserRouter:
    def __init__(self):
        self.native_pdf = NativePdfParser()
        self.native_docx = NativeDocxParser()
        self.native_pptx = NativePptxParser()
        self.native_xlsx = NativeXlsxParser()
        self.native_txt = NativeTxtParser()
        self.mineru = MinerUAdapter()
        self.paddle = PaddleOCRVLAdapter()

    def route_and_parse(self, file_path: str, doc_id: str) -> CanonicalDocument:
        ext = os.path.splitext(file_path)[1].lower()

        # 1. Native structured files
        if ext == ".docx":
            return self.native_docx.parse(file_path, doc_id)
        elif ext == ".pptx":
            return self.native_pptx.parse(file_path, doc_id)
        elif ext == ".xlsx":
            return self.native_xlsx.parse(file_path, doc_id)
        elif ext == ".txt":
            return self.native_txt.parse(file_path, doc_id)
        elif ext in [".png", ".jpg", ".jpeg", ".webp"]:
            # Single image / handwritten photo -> PaddleOCR
            if self.paddle.is_available():
                page = self.paddle.parse_image(file_path, page_num=1)
                return CanonicalDocument(
                    document_id=doc_id,
                    pages=[page],
                    parser_used="paddleocr_vl",
                    document_type="HANDWRITTEN_NOTES",
                    metadata={"page_count": 1}
                )
            else:
                raise RuntimeError("PaddleOCR is required for images but is unavailable.")

        # 2. PDF Documents
        if ext == ".pdf":
            has_good_text, page_count, avg_chars = self.native_pdf.inspect_pdf_text_quality(file_path)

            if has_good_text:
                # Digital PDF with clean embedded text
                return self.native_pdf.parse(file_path, doc_id)
            else:
                # Scanned PDF or Book with little/no text layer
                if self.mineru.is_available():
                    try:
                        return self.mineru.parse(file_path, doc_id)
                    except Exception as err:
                        # Fallback to PaddleOCR if available
                        if self.paddle.is_available():
                            doc = self.paddle.parse_pdf_scans(file_path, doc_id)
                            doc.metadata["fallback_from"] = "mineru"
                            doc.metadata["mineru_error"] = str(err)
                            return doc
                        raise
                elif self.paddle.is_available():
                    # Fallback to PaddleOCR for scan parsing
                    doc = self.paddle.parse_pdf_scans(file_path, doc_id)
                    doc.metadata["mineru_status"] = "unavailable_used_paddle"
                    return doc
                else:
                    # Still attempt native extraction with warning
                    doc = self.native_pdf.parse(file_path, doc_id)
                    doc.metadata["warning"] = "Scanned PDF detected but MinerU and PaddleOCR are unavailable."
                    return doc

        raise ValueError(f"Unsupported file format: {ext}")
