/**
 * Centralised workflow statuses used across the app.
 * All status values should reference these constants rather than inline strings.
 */

// ── Compliance ──
export const COMPLIANCE_STATUS = {
  PENDING: "pending",
  PERMITTED: "permitted",
  REVIEW_REQUIRED: "review_required",
  BLOCKED: "blocked",
} as const;

export type ComplianceStatus = (typeof COMPLIANCE_STATUS)[keyof typeof COMPLIANCE_STATUS];

// ── Enrichment ──
export const ENRICHMENT_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETE: "complete",
  FAILED: "failed",
} as const;

export type EnrichmentStatus = (typeof ENRICHMENT_STATUS)[keyof typeof ENRICHMENT_STATUS];

// ── Channel draft status (eBay + Shopify) ──
export const CHANNEL_STATUS = {
  DRAFT: "draft",
  READY: "ready",
  EXPORTED: "exported",
  PUBLISHED: "published",
  FAILED: "failed",
} as const;

export type ChannelStatus = (typeof CHANNEL_STATUS)[keyof typeof CHANNEL_STATUS];

// ── Stock sync item status ──
export const SYNC_ITEM_STATUS = {
  PENDING: "pending",
  MATCHED_NO_CHANGE: "matched_no_change",
  UPDATE_NEEDED: "update_needed",
  NO_MATCH: "no_match",
  UNCERTAIN_MATCH: "uncertain_match",
  SYNC_SUCCESS: "sync_success",
  SYNC_FAILED: "sync_failed",
  SKIPPED_ZERO: "skipped_zero",
} as const;

export type SyncItemStatus = (typeof SYNC_ITEM_STATUS)[keyof typeof SYNC_ITEM_STATUS];

// ── Stock sync run status ──
export const SYNC_RUN_STATUS = {
  PENDING: "pending",
  PREVIEW: "preview",
  PREVIEW_COMPLETE: "preview_complete",
  SYNCING: "syncing",
  COMPLETED: "completed",
} as const;

export type SyncRunStatus = (typeof SYNC_RUN_STATUS)[keyof typeof SYNC_RUN_STATUS];

// ── Shopify sync / connection status ──
export const SHOPIFY_SYNC_STATUS = {
  CONNECTED: "connected",
  SYNCED: "synced",
  RUNNING: "running",
  COMPLETED: "completed",
  COMPLETED_WITH_ERRORS: "completed_with_errors",
} as const;

// ── Match confidence levels ──
export const MATCH_CONFIDENCE = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  NONE: "none",
} as const;

export type MatchConfidence = (typeof MATCH_CONFIDENCE)[keyof typeof MATCH_CONFIDENCE];

// ── Validation status ──
export const VALIDATION_STATUS = {
  VALID: "valid",
  WARNINGS: "warnings",
  ERRORS: "errors",
} as const;
