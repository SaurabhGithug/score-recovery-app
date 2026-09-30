-- ============================================================================
-- Migration: 0001_foundation_schema.sql
-- Description: Adaptive Preparation Platform Schema for Indian Government Examinations
-- Supports: Universal Knowledge Brain, Exam Brain, Student Brain, Learning Policy Brain
-- ============================================================================

-- Enums
-- Publishing Status: Draft, Machine-validated, Expert-reviewed, Published, Rejected, Retired
-- Verification Status: Unverified, Provisional, Verified
-- Confidence Level: Low, Medium, High
-- Question Cognitive Level: Remember, Understand, Apply, Analyze, Evaluate

-- ----------------------------------------------------------------------------
-- 1. Organizations & Institutional Roles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    short_code VARCHAR(32) NOT NULL,
    official_website VARCHAR(512),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exam_organization_roles (
    id VARCHAR(64) PRIMARY KEY,
    exam_id VARCHAR(64) NOT NULL,
    organization_id VARCHAR(64) NOT NULL,
    -- Roles: recruiting_organization | exam_owner | paper_setting_organization | conducting_agency | cbt_platform_vendor
    role_type VARCHAR(64) NOT NULL,
    evidence_source TEXT NOT NULL,
    verification_status VARCHAR(32) NOT NULL DEFAULT 'provisional', -- unverified | provisional | verified
    confidence_level VARCHAR(16) NOT NULL DEFAULT 'medium',        -- low | medium | high
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_eor_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT
);

-- ----------------------------------------------------------------------------
-- 2. Universal Knowledge Brain
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subjects (
    id VARCHAR(64) PRIMARY KEY,
    name_en VARCHAR(255) NOT NULL,
    name_hi VARCHAR(255) NOT NULL,
    code VARCHAR(32) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS syllabus_nodes (
    id VARCHAR(64) PRIMARY KEY,
    subject_id VARCHAR(64) NOT NULL,
    parent_id VARCHAR(64),
    node_type VARCHAR(32) NOT NULL, -- subject | unit | topic | subtopic
    title_en VARCHAR(255) NOT NULL,
    title_hi VARCHAR(255) NOT NULL,
    description_en TEXT,
    description_hi TEXT,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sn_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    CONSTRAINT fk_sn_parent FOREIGN KEY (parent_id) REFERENCES syllabus_nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS concepts (
    id VARCHAR(64) PRIMARY KEY,
    syllabus_node_id VARCHAR(64) NOT NULL,
    canonical_name VARCHAR(255) NOT NULL UNIQUE,
    name_en VARCHAR(255) NOT NULL,
    name_hi VARCHAR(255) NOT NULL,
    summary_en TEXT NOT NULL,
    summary_hi TEXT NOT NULL,
    formulae JSONB DEFAULT '[]'::jsonb,
    misconceptions JSONB DEFAULT '[]'::jsonb,
    question_archetypes JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_concept_node FOREIGN KEY (syllabus_node_id) REFERENCES syllabus_nodes(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS concept_prerequisites (
    id VARCHAR(64) PRIMARY KEY,
    concept_id VARCHAR(64) NOT NULL,
    prerequisite_concept_id VARCHAR(64) NOT NULL,
    is_strict BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cp_concept FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE,
    CONSTRAINT fk_cp_prereq FOREIGN KEY (prerequisite_concept_id) REFERENCES concepts(id) ON DELETE CASCADE,
    CONSTRAINT uq_concept_prereq UNIQUE(concept_id, prerequisite_concept_id)
);

-- ----------------------------------------------------------------------------
-- 3. Exam Brain
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exams (
    id VARCHAR(64) PRIMARY KEY,
    family_code VARCHAR(32) NOT NULL, -- e.g. ssc-je, isro-jpa
    title_en VARCHAR(255) NOT NULL,
    title_hi VARCHAR(255) NOT NULL,
    conducting_body VARCHAR(255) NOT NULL,
    requires_branch_selection BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exam_cycles (
    id VARCHAR(64) PRIMARY KEY,
    exam_id VARCHAR(64) NOT NULL,
    cycle_year INT NOT NULL,
    notification_number VARCHAR(128),
    notification_date DATE,
    official_source_url VARCHAR(512),
    pattern_version VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'draft', -- draft | verified_official | archived
    evidence_gaps JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ec_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    CONSTRAINT uq_exam_cycle UNIQUE(exam_id, cycle_year, pattern_version)
);

CREATE TABLE IF NOT EXISTS exam_branches (
    id VARCHAR(64) PRIMARY KEY,
    exam_id VARCHAR(64) NOT NULL,
    branch_code VARCHAR(32) NOT NULL, -- civil | electrical | mechanical | common
    name_en VARCHAR(255) NOT NULL,
    name_hi VARCHAR(255) NOT NULL,
    technical_content_ready BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_eb_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    CONSTRAINT uq_exam_branch UNIQUE(exam_id, branch_code)
);

CREATE TABLE IF NOT EXISTS exam_stages (
    id VARCHAR(64) PRIMARY KEY,
    cycle_id VARCHAR(64) NOT NULL,
    stage_number INT NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_hi VARCHAR(255) NOT NULL,
    selection_type VARCHAR(32) NOT NULL, -- qualifying | merit
    delivery_mode VARCHAR(32) NOT NULL,  -- cbt | pen_paper | skill_test
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_es_cycle FOREIGN KEY (cycle_id) REFERENCES exam_cycles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exam_papers (
    id VARCHAR(64) PRIMARY KEY,
    stage_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64), -- Nullable for branch-neutral common papers
    paper_number INT NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_hi VARCHAR(255) NOT NULL,
    duration_minutes INT, -- Nullable if evidence gap exists
    total_marks NUMERIC(6, 2),
    total_questions INT,
    marking_correct NUMERIC(4, 2),
    marking_negative NUMERIC(4, 2), -- Positive value deducted
    calculator_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    language_rules JSONB DEFAULT '["en", "hi"]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ep_stage FOREIGN KEY (stage_id) REFERENCES exam_stages(id) ON DELETE CASCADE,
    CONSTRAINT fk_ep_branch FOREIGN KEY (branch_id) REFERENCES exam_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS exam_sections (
    id VARCHAR(64) PRIMARY KEY,
    paper_id VARCHAR(64) NOT NULL,
    section_code VARCHAR(32) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_hi VARCHAR(255) NOT NULL,
    question_count INT,
    total_marks NUMERIC(6, 2),
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_esec_paper FOREIGN KEY (paper_id) REFERENCES exam_papers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exam_concept_profiles (
    id VARCHAR(64) PRIMARY KEY,
    exam_id VARCHAR(64) NOT NULL,
    concept_id VARCHAR(64) NOT NULL,
    topic_weight NUMERIC(5, 2) NOT NULL DEFAULT 1.0,
    typical_difficulty NUMERIC(3, 2) NOT NULL DEFAULT 1.0, -- 1.0 to 3.0
    typical_solving_time_seconds INT NOT NULL DEFAULT 60,
    exam_specific_style_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ecp_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    CONSTRAINT fk_ecp_concept FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE,
    CONSTRAINT uq_exam_concept UNIQUE(exam_id, concept_id)
);

-- ----------------------------------------------------------------------------
-- 4. Source Provenance & Question Items
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS source_documents (
    id VARCHAR(64) PRIMARY KEY,
    exam_id VARCHAR(64),
    cycle_id VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    source_tier VARCHAR(32) NOT NULL, -- official_recruiter | official_unit | third_party_scan
    source_url VARCHAR(512),
    local_path VARCHAR(512) NOT NULL,
    rights_and_provenance TEXT NOT NULL,
    allow_public_publishing BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sd_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE SET NULL,
    CONSTRAINT fk_sd_cycle FOREIGN KEY (cycle_id) REFERENCES exam_cycles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS question_items (
    id VARCHAR(64) PRIMARY KEY,
    canonical_code VARCHAR(64) UNIQUE,
    exam_id VARCHAR(64) NOT NULL,
    cycle_id VARCHAR(64),
    branch_id VARCHAR(64),
    section_id VARCHAR(64),
    question_type VARCHAR(32) NOT NULL DEFAULT 'mcq_single', -- mcq_single | numerical | cloze | passage_mcq
    cognitive_level VARCHAR(32) NOT NULL DEFAULT 'apply',     -- remember | understand | apply | analyze | evaluate
    target_time_seconds INT NOT NULL DEFAULT 60,
    difficulty_rating NUMERIC(3, 2) NOT NULL DEFAULT 1.5,
    publishing_status VARCHAR(32) NOT NULL DEFAULT 'draft',   -- draft | machine_validated | expert_reviewed | published | rejected | retired
    latest_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_qi_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE RESTRICT,
    CONSTRAINT fk_qi_cycle FOREIGN KEY (cycle_id) REFERENCES exam_cycles(id) ON DELETE SET NULL,
    CONSTRAINT fk_qi_branch FOREIGN KEY (branch_id) REFERENCES exam_branches(id) ON DELETE SET NULL,
    CONSTRAINT fk_qi_section FOREIGN KEY (section_id) REFERENCES exam_sections(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS question_item_versions (
    id VARCHAR(64) PRIMARY KEY,
    question_id VARCHAR(64) NOT NULL,
    version_number INT NOT NULL,
    stem_en TEXT NOT NULL,
    stem_hi TEXT NOT NULL,
    explanation_en TEXT NOT NULL,
    explanation_hi TEXT NOT NULL,
    formulae_and_units JSONB DEFAULT '{}'::jsonb,
    generator_metadata JSONB DEFAULT '{}'::jsonb,
    reviewed_by VARCHAR(128),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_qiv_question FOREIGN KEY (question_id) REFERENCES question_items(id) ON DELETE CASCADE,
    CONSTRAINT uq_q_version UNIQUE(question_id, version_number)
);

CREATE TABLE IF NOT EXISTS question_options (
    id VARCHAR(64) PRIMARY KEY,
    version_id VARCHAR(64) NOT NULL,
    option_key VARCHAR(8) NOT NULL, -- A | B | C | D
    text_en TEXT NOT NULL,
    text_hi TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    distractor_explanation_en TEXT,
    distractor_explanation_hi TEXT,
    misconception_tag VARCHAR(128),
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_qo_version FOREIGN KEY (version_id) REFERENCES question_item_versions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS question_concepts (
    id VARCHAR(64) PRIMARY KEY,
    question_id VARCHAR(64) NOT NULL,
    concept_id VARCHAR(64) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_qc_question FOREIGN KEY (question_id) REFERENCES question_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_qc_concept FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS question_provenance (
    id VARCHAR(64) PRIMARY KEY,
    question_id VARCHAR(64) NOT NULL,
    source_document_id VARCHAR(64) NOT NULL,
    paper_code VARCHAR(64) NOT NULL,
    original_question_number VARCHAR(16) NOT NULL,
    source_pdf_page INT NOT NULL,
    ocr_confidence NUMERIC(5, 2),
    ocr_source VARCHAR(64),
    raw_extracted_text TEXT,
    extraction_mode VARCHAR(64) NOT NULL, -- numbered_block_unverified | verified_text
    has_diagram BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_qp_question FOREIGN KEY (question_id) REFERENCES question_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_qp_source FOREIGN KEY (source_document_id) REFERENCES source_documents(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS question_validations (
    id VARCHAR(64) PRIMARY KEY,
    question_id VARCHAR(64) NOT NULL,
    validator_type VARCHAR(32) NOT NULL, -- automated_rules | expert_reviewer | pilot_audit
    status VARCHAR(32) NOT NULL,         -- passed | failed | flagged
    validation_report JSONB NOT NULL,
    validated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_qv_question FOREIGN KEY (question_id) REFERENCES question_items(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 5. Student Brain & Multi-dimensional Modeling
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_exam_profiles (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL,
    exam_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64),
    target_exam_cycle_year INT,
    selected_language VARCHAR(8) NOT NULL DEFAULT 'en',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sep_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    CONSTRAINT fk_sep_branch FOREIGN KEY (branch_id) REFERENCES exam_branches(id) ON DELETE SET NULL,
    CONSTRAINT uq_student_exam UNIQUE(student_id, exam_id)
);

CREATE TABLE IF NOT EXISTS practice_sessions (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL,
    exam_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64),
    mode VARCHAR(32) NOT NULL, -- full_diagnostic | targeted_repair | mock_test | speed_drill
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    session_config JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS attempts (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64),
    student_id VARCHAR(64) NOT NULL,
    exam_id VARCHAR(64) NOT NULL,
    question_id VARCHAR(64) NOT NULL,
    selected_option_key VARCHAR(8),
    is_correct BOOLEAN,
    time_spent_seconds INT NOT NULL DEFAULT 0,
    visit_count INT NOT NULL DEFAULT 1,
    answer_change_count INT NOT NULL DEFAULT 0,
    marked_for_review BOOLEAN NOT NULL DEFAULT FALSE,
    confidence_self_report VARCHAR(16), -- low | medium | high | null
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_att_question FOREIGN KEY (question_id) REFERENCES question_items(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS student_concept_states (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL,
    concept_id VARCHAR(64) NOT NULL,
    accuracy_ratio NUMERIC(4, 3) NOT NULL DEFAULT 0.0,
    difficulty_adjusted_mastery NUMERIC(4, 3) NOT NULL DEFAULT 0.0,
    solving_speed_index NUMERIC(5, 2) NOT NULL DEFAULT 1.0, -- actual / expected
    retention_score NUMERIC(4, 3) NOT NULL DEFAULT 1.0,
    confidence_calibration_score NUMERIC(4, 3) NOT NULL DEFAULT 0.5,
    transfer_ability_score NUMERIC(4, 3) NOT NULL DEFAULT 0.5,
    hint_dependence_index NUMERIC(4, 3) NOT NULL DEFAULT 0.0,
    consistency_score NUMERIC(4, 3) NOT NULL DEFAULT 0.5,
    attempts_total INT NOT NULL DEFAULT 0,
    attempts_correct INT NOT NULL DEFAULT 0,
    last_practiced_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_scs_concept FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE,
    CONSTRAINT uq_student_concept UNIQUE(student_id, concept_id)
);

CREATE TABLE IF NOT EXISTS misconception_evidences (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL,
    concept_id VARCHAR(64) NOT NULL,
    attempt_id VARCHAR(64) NOT NULL,
    misconception_key VARCHAR(128) NOT NULL,
    observed_cause VARCHAR(64) NOT NULL,
    frequency INT NOT NULL DEFAULT 1,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_me_concept FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE,
    CONSTRAINT fk_me_attempt FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS review_schedules (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL,
    concept_id VARCHAR(64) NOT NULL,
    next_review_due TIMESTAMP WITH TIME ZONE NOT NULL,
    repetition_interval_days INT NOT NULL DEFAULT 1,
    forgetting_risk_rating NUMERIC(4, 3) NOT NULL DEFAULT 0.5,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rs_concept FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
);

-- Indexes for efficient query execution
CREATE INDEX IF NOT EXISTS idx_concepts_node ON concepts(syllabus_node_id);
CREATE INDEX IF NOT EXISTS idx_qi_exam_status ON question_items(exam_id, publishing_status);
CREATE INDEX IF NOT EXISTS idx_attempts_student_question ON attempts(student_id, question_id);
CREATE INDEX IF NOT EXISTS idx_student_concept ON student_concept_states(student_id, concept_id);
CREATE INDEX IF NOT EXISTS idx_review_schedule_due ON review_schedules(student_id, next_review_due, is_completed);
