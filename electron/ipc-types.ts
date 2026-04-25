/**
 * Shared IPC type definitions for the renderer <-> main bridge.
 *
 * Using these shapes everywhere makes IPC call sites type-safe and forces
 * consistent error handling.
 */

// ── Generic response wrappers ─────────────────────────────────────────────

export interface SuccessResult<T> {
  success: true;
  data: T;
}

export interface ErrorResult {
  success: false;
  error: string;
}

export type IPCResult<T> = SuccessResult<T> | ErrorResult;

// ── Payload wrappers for consistent handler signatures ──────────────────────

export function ok<T>(data: T): SuccessResult<T> {
  return { success: true, data };
}

export function err(message: string): ErrorResult {
  return { success: false, error: message };
}
