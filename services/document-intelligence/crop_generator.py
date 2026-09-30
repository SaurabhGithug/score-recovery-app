"""
Crop Generator:
Renders original PDF pages and extracts question crops for visual provenance.
Enables 'View Source' comparison between original paper and extracted question.
"""

import os
from typing import Optional

class CropGenerator:
    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def generate_page_preview(self, file_path: str, doc_id: str, page_num: int) -> Optional[str]:
        """Renders page_num from PDF as a PNG preview."""
        ext = os.path.splitext(file_path)[1].lower()
        if ext != ".pdf":
            return None

        out_name = f"{doc_id}_p{page_num}.png"
        out_path = os.path.join(self.output_dir, out_name)

        if os.path.exists(out_path):
            return out_name

        try:
            import pypdfium2 as pdfium
            doc = pdfium.PdfDocument(file_path)
            if page_num - 1 < len(doc):
                page = doc[page_num - 1]
                # Render at 1.5x resolution for sharp reading
                pil_image = page.render(scale=1.5).to_pil()
                pil_image.save(out_path, format="PNG", optimize=True)
                return out_name
        except Exception:
            return None
        return None
