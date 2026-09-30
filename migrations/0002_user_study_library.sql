-- ============================================================================
-- Migration: 0002_user_study_library.sql
-- Description: User identity, study document library, and extracted questions
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_normalized_name ON users(normalized_name);

CREATE TABLE IF NOT EXISTS study_documents (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    original_name VARCHAR(512) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    storage_path VARCHAR(1024),
    file_size_bytes INTEGER DEFAULT 0,
    document_type VARCHAR(64) DEFAULT 'UNKNOWN',
    -- UPLOADED | QUEUED | PROCESSING | READY | PARTIAL | FAILED
    extraction_status VARCHAR(32) NOT NULL DEFAULT 'UPLOADED',
    status_message TEXT,
    parser_used VARCHAR(64),
    page_count INTEGER DEFAULT 0,
    questions_count INTEGER DEFAULT 0,
    ready_questions_count INTEGER DEFAULT 0,
    review_questions_count INTEGER DEFAULT 0,
    metadata JSON DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_study_documents_user ON study_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_study_documents_status ON study_documents(extraction_status);

CREATE TABLE IF NOT EXISTS document_pages (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL,
    page_number INTEGER NOT NULL,
    raw_text TEXT,
    markdown TEXT,
    parser VARCHAR(64),
    confidence REAL DEFAULT 1.0,
    image_path VARCHAR(1024),
    metadata JSON DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES study_documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_document_pages_doc ON document_pages(document_id, page_number);

CREATE TABLE IF NOT EXISTS imported_questions (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    question_number INTEGER,
    question_text TEXT NOT NULL,
    question_type VARCHAR(32) NOT NULL DEFAULT 'MCQ', -- MCQ | NUMERICAL
    options JSON NOT NULL DEFAULT '[]', -- Array of { id: "A"|"B"|"C"|"D", text: string }
    correct_answer VARCHAR(16),
    explanation TEXT,
    subject VARCHAR(128),
    topic VARCHAR(128),
    difficulty INTEGER DEFAULT 2, -- 1 = easy, 2 = medium, 3 = hard
    source_page INTEGER NOT NULL DEFAULT 1,
    source_bounding_box JSON, -- [ymin, xmin, ymax, xmax]
    source_image_crop VARCHAR(1024),
    -- EXTRACTED | GENERATED
    source_type VARCHAR(32) NOT NULL DEFAULT 'EXTRACTED',
    extraction_confidence REAL DEFAULT 1.0,
    -- AUTO_ACCEPTED | VERIFIED | NEEDS_REVIEW | REJECTED
    verification_status VARCHAR(32) NOT NULL DEFAULT 'AUTO_ACCEPTED',
    review_reason TEXT,
    metadata JSON DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES study_documents(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_imported_questions_user_doc ON imported_questions(user_id, document_id);
CREATE INDEX IF NOT EXISTS idx_imported_questions_status ON imported_questions(verification_status);
