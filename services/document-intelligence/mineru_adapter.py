"""
MinerU Adapter for complex books and dense multi-column PDFs.
Interacts with MinerU / magic-pdf CLI or local HTTP service.
Fails explicitly if MinerU is unavailable without fabricating text.
"""

import shutil
import subprocess
import json
import os
from typing import Optional
from canonical import CanonicalDocument, CanonicalPage, CanonicalBlock

class MinerUUnavailableError(Exception):
    """Raised when MinerU is not installed or service is not running."""
    pass

class MinerUAdapter:
    def __init__(self, service_url: Optional[str] = None):
        self.service_url = service_url or os.environ.get("MINERU_SERVICE_URL")
        self.cli_cmd = shutil.which("magic-pdf")

    def is_available(self) -> bool:
        """Returns True if MinerU CLI or service is available."""
        if self.cli_cmd:
            return True
        # Check python module
        try:
            import magic_pdf
            return True
        except ImportError:
            pass
        return False

    def parse(self, file_path: str, doc_id: str) -> CanonicalDocument:
        """Parses document via MinerU and normalizes to CanonicalDocument."""
        if not self.is_available():
            raise MinerUUnavailableError(
                "MinerU parser is unavailable. 'magic-pdf' is not installed in the environment. "
                "Falling back to native or specialist OCR parser."
            )

        # If magic-pdf CLI is available, execute it into temp directory
        output_dir = f"/tmp/mineru_{doc_id}"
        os.makedirs(output_dir, exist_ok=True)

        try:
            cmd = [self.cli_cmd, "-p", file_path, "-o", output_dir, "-m", "auto"]
            subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=300)

            # MinerU outputs <filename>_content_list.json and markdown
            base_name = os.path.splitext(os.path.basename(file_path))[0]
            content_list_path = os.path.join(output_dir, base_name, "auto", f"{base_name}_content_list.json")

            if not os.path.exists(content_list_path):
                raise RuntimeError(f"MinerU completed without producing content list at {content_list_path}")

            with open(content_list_path, "r", encoding="utf-8") as f:
                content_list = json.load(f)

            # Transform into CanonicalDocument
            pages_map = {}
            for idx, item in enumerate(content_list):
                page_idx = item.get("page_idx", 0) + 1
                if page_idx not in pages_map:
                    pages_map[page_idx] = []

                b_type = item.get("type", "text").upper()
                text = item.get("text", "")
                bbox = item.get("bbox")

                pages_map[page_idx].append(CanonicalBlock(
                    id=f"p{page_idx}_b{idx}",
                    type=b_type,
                    text=text,
                    bbox=bbox,
                    confidence=0.97,
                    parser="mineru"
                ))

            canonical_pages = []
            for p_num in sorted(pages_map.keys()):
                blks = pages_map[p_num]
                raw_text = "\n".join([b.text for b in blks if b.text])
                canonical_pages.append(CanonicalPage(
                    page_number=p_num,
                    blocks=blks,
                    raw_text=raw_text,
                    markdown=raw_text,
                    parser="mineru",
                    confidence=0.97
                ))

            return CanonicalDocument(
                document_id=doc_id,
                pages=canonical_pages,
                parser_used="mineru",
                document_type="BOOK",
                metadata={"mineru_version": "auto"}
            )
        finally:
            # Clean up temp files
            shutil.rmtree(output_dir, ignore_errors=True)
