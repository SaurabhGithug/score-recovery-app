"""
Canonical Document representation for Document Intelligence pipeline.
All parsers normalize into this standard representation.
"""

from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict, Any

@dataclass
class CanonicalBlock:
    id: str
    type: str  # TEXT, TITLE, QUESTION, OPTION, FORMULA, TABLE, IMAGE, HEADER, FOOTER
    text: str
    bbox: Optional[List[float]] = None  # [ymin, xmin, ymax, xmax] in normalized (0..1000) or pt
    confidence: float = 1.0
    parser: str = "native"
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class CanonicalPage:
    page_number: int
    blocks: List[CanonicalBlock] = field(default_factory=list)
    raw_text: Optional[str] = None
    markdown: Optional[str] = None
    parser: Optional[str] = None
    confidence: float = 1.0
    image_path: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class CanonicalDocument:
    document_id: str
    pages: List[CanonicalPage] = field(default_factory=list)
    parser_used: str = "unknown"
    document_type: str = "UNKNOWN"  # BOOK, QUESTION_PAPER, NOTES, HANDWRITTEN_NOTES, UNKNOWN
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
