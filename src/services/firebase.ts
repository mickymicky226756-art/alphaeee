/**
 * Firebase bootstrap. Reads config from .env via the `ENV` helper and
 * exposes a single `db` reference. If Firebase isn't configured we log
 * a clear warning — the panel will fall back to demo mode automatically.
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  onValue,
  push,
  set,
  update,
  get,
  query,
  orderByChild,
  runTransaction,
  type Database,
} from 'firebase/database';
import { ENV, isFirebaseConfigured } from '../config/env';

let app: FirebaseApp | null = null;
let db: Database | null = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(ENV.firebase);
    db = getDatabase(app);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[firebase] init failed', err);
  }
} else {
  // eslint-disable-next-line no-console
  console.warn(
    '[firebase] not configured. Running in demo mode.\n' +
      'Fill VITE_FIREBASE_* in .env to enable live data.',
  );
}

export { app, db, isFirebaseConfigured };
export const r = ref;
export const fq = query;
export const fOrder = orderByChild;
export const fOn = onValue;
export const fSet = set;
export const fUpdate = update;
export const fGet = get;
export const fPush = push;
export { runTransaction };
