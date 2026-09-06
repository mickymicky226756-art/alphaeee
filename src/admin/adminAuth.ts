// ----------------------------------------------------------------------
// Admin auth — local session backed by localStorage.
//
// Two roles share the login screen:
//   - `super`        : full access to every section (Dashboard, Users,
//                       Transactions, Plans, Banks, Gifts, Settings).
//   - `withdrawals`  : read+write access to withdrawals only. The
//                       AdminShell filters its nav down to a single
//                       Withdrawals view; every other section is hidden.
//
// Each role has its own (id, password) pair in `ENV.admin`. The
// credentials are matched exactly — no hashing, no expiry — because
// this is a single-tenant admin panel whose only job is to gate
// direct UI access. The data layer (RTDB) has its own security rules.
// ----------------------------------------------------------------------

import { ENV } from '../config/env';

export type AdminRole = 'super' | 'withdrawals';

const LS_KEY = 'alpha-admin::session-v1';

export interface AdminSession {
  id: string;
  role: AdminRole;
  loggedInAt: number;
}

export interface CredentialResult {
  ok: boolean;
  role?: AdminRole;
}

/** Look up a credentials pair in the `ENV.admin` config and return
 *  the role it belongs to. Returns `{ ok: false }` if neither pair
 *  matches the input. */
export function checkCredentials(id: string, password: string): CredentialResult {
  const trimmedId = (id ?? '').trim();
  if (!trimmedId || !password) return { ok: false };
  if (
    trimmedId === ENV.admin.super.id &&
    password === ENV.admin.super.password
  ) {
    return { ok: true, role: 'super' };
  }
  if (
    trimmedId === ENV.admin.withdrawals.id &&
    password === ENV.admin.withdrawals.password
  ) {
    return { ok: true, role: 'withdrawals' };
  }
  return { ok: false };
}

export function readSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminSession;
    if (!parsed?.id) return null;
    // Backward-compat: pre-role sessions default to `super` so an
    // existing admin who was already signed in isn't locked out by
    // a code upgrade. They can re-login if they want a fresh role
    // tag in the session.
    if (!parsed.role) parsed.role = 'super';
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(s: AdminSession) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}
