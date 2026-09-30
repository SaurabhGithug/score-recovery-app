-- ============================================================================
-- Migration: 0005_llm_spend.sql
-- Description: Ledger of billed LLM calls (question generation), for the daily spending limit.
-- No foreign keys on purpose: deleting a document or user must not erase spend history.
-- ============================================================================

CREATE TABLE IF NOT EXISTS llm_spend (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    document_id VARCHAR(64),
    model VARCHAR(128) NOT NULL,
    cost_usd NUMERIC(12, 6) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_llm_spend_created ON llm_spend(created_at);
