"""
PaddleOCR-VL Adapter for handwriting, photographed notes, and scan fallbacks.
Specialist parser invoked only for difficult or scanned pages.
"""

import os
from typing import List, Optional
from canonical import CanonicalDocument, CanonicalPage, CanonicalBlock

class PaddleOCRVLAdapter:
    def __init__(self):
        self._ocr = None

    def is_available(self) -> bool:
        try:
            import paddleocr
            return True
        except ImportError:
            return False

    def _get_ocr(self):
        if self._ocr is None:
            from paddleocr import PaddleOCR
            # Initialize OCR with bilingual english/hindi support if available
            self._ocr = PaddleOCR(use_angle_cls=True, lang="en")
        return self._ocr

    def parse_image(self, image_path: str, page_num: int = 1) -> CanonicalPage:
        """Runs PaddleOCR on a single image and extracts blocks."""
        ocr = self._get_ocr()
        result = ocr.ocr(image_path, cls=True)

        blocks: List[CanonicalBlock] = []
        raw_lines: List[str] = []

        if result and len(result) > 0 and result[0]:
            for idx, line in enumerate(result[0]):
                box = line[0]  # [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
                text, conf = line[1]

                # Convert box to [ymin, xmin, ymax, xmax]
                xs = [pt[0] for pt in box]
                ys = [pt[1] for pt in box]
                bbox = [min(ys), min(xs), max(ys), max(xs)]

                raw_lines.append(text)
                blocks.append(CanonicalBlock(
                    id=f"p{page_num}_b{idx}",
                    type="TEXT",
                    text=text,
                    bbox=bbox,
                    confidence=float(conf),
                    parser="paddleocr_vl"
                ))

        raw_text = "\n".join(raw_lines)
        return CanonicalPage(
            page_number=page_num,
            blocks=blocks,
            raw_text=raw_text,
            markdown=raw_text,
            parser="paddleocr_vl",
            confidence=0.91,
            image_path=image_path
        )

    def parse_pdf_scans(self, file_path: str, doc_id: str) -> CanonicalDocument:
        """Renders PDF pages to images and runs PaddleOCR on each."""
        import pypdfium2 as pdfium
        from PIL import Image

        doc = pdfium.PdfDocument(file_path)
        pages: List[CanonicalPage] = []
        temp_dir = f"/tmp/paddle_{doc_id}"
        os.makedirs(temp_dir, exist_ok=True)

        try:
            for page_idx in range(len(doc)):
                page_num = page_idx + 1
                page = doc[page_idx]
                pil_image = page.render(scale=2).to_pil()
                img_path = os.path.join(temp_dir, f"page_{page_num}.png")
                pil_image.save(img_path)

                canon_page = self.parse_image(img_path, page_num=page_num)
                pages.append(canon_page)

            return CanonicalDocument(
                document_id=doc_id,
                pages=pages,
                parser_used="paddleocr_vl",
                document_type="HANDWRITTEN_NOTES" if "handwritten" in file_path.lower() else "SCANNED_DOCUMENT",
                metadata={"page_count": len(pages)}
            )
        finally:
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)
