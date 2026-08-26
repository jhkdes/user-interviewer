/**
 * Best-effort UA-based mobile detection — used to warn participants before
 * starting a call (mobile browsers suspend backgrounded tabs, dropping the
 * call) and to record device type on the Interview for later reporting.
 * Not authoritative: iPadOS Safari, for example, often reports a
 * desktop-like UA and won't be flagged here. Client-only (`navigator` isn't
 * available during SSR) — callers must guard for that themselves.
 */
export function isMobileDevice(): boolean {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
