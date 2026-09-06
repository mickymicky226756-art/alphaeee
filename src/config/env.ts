/**
 * Centralised environment configuration.
 * Reads from import.meta.env (provided by Vite) and falls back to safe
 * defaults so the panel still renders while you're filling in .env.
 */

export const ENV = {
  brandName: import.meta.env.VITE_ADMIN_BRAND_NAME || 'Alpha Trading',

  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
  },

  // Admin panel credentials. Two roles share the login screen:
  //   - `super`       : full access to every section.
  //   - `withdrawals` : read+write access to withdrawals only; the
  //                     navigation collapses to a single Withdrawals
  //                     view and every other section is hidden.
  // Override either set via VITE_ADMIN_ID / VITE_ADMIN_PASSWORD
  // (super) and VITE_WITHDRAWAL_ADMIN_ID / VITE_WITHDRAWAL_ADMIN_PASSWORD
  // (withdrawals) in .env.
  admin: {
    super: {
      id: import.meta.env.VITE_ADMIN_ID || '22675655',
      password: import.meta.env.VITE_ADMIN_PASSWORD || 'admin123321',
    },
    withdrawals: {
      id: import.meta.env.VITE_WITHDRAWAL_ADMIN_ID || '44',
      password:
        import.meta.env.VITE_WITHDRAWAL_ADMIN_PASSWORD || 'a444',
    },
  },
};

export const isFirebaseConfigured = Boolean(
  ENV.firebase.apiKey && ENV.firebase.databaseURL && ENV.firebase.projectId,
);
