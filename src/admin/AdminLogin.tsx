import { useEffect, useState } from 'react';
import { checkCredentials, writeSession, type AdminRole } from './adminAuth';
import { ENV } from '../config/env';
import { useAdminToast } from './components/Toast';
import { isFirebaseConfigured } from '../config/env';

interface AdminLoginProps {
  onSuccess: (role: AdminRole) => void;
}

export function AdminLogin({ onSuccess }: AdminLoginProps) {
  const [id, setId] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState(false);
  const toast = useAdminToast();

  useEffect(() => {
    setId('');
    setPass('');
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const result = checkCredentials(id, pass);
    if (result.ok && result.role) {
      setError(false);
      writeSession({ id: id.trim(), role: result.role, loggedInAt: Date.now() });
      toast(
        result.role === 'withdrawals'
          ? 'Welcome — Withdrawal Manager'
          : 'Welcome back, Administrator',
        'success',
      );
      onSuccess(result.role);
    } else {
      setError(true);
      setPass('');
    }
  };

  return (
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={handleSubmit}>
        <div className="admin-login-logo">
          <i className="fa-solid fa-shield-halved" />
        </div>
        <h1>{ENV.brandName} Admin</h1>
        <p className="admin-login-sub">Restricted access. Authorized personnel only.</p>

        {error && (
          <div className="admin-login-error show">
            <i className="fa-solid fa-circle-exclamation" />
            <span>Invalid credentials. Please try again.</span>
          </div>
        )}

        <div className="admin-input-group">
          <label htmlFor="admin-login-id">Admin ID</label>
          <div className="admin-input-wrap">
            <i className="fa-solid fa-user ad-input-icon" />
            <input
              id="admin-login-id"
              type="text"
              placeholder="Enter admin ID"
              autoComplete="username"
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                setError(false);
              }}
              required
            />
          </div>
        </div>

        <div className="admin-input-group">
          <label htmlFor="admin-login-pass">Password</label>
          <div className="admin-input-wrap">
            <i className="fa-solid fa-lock ad-input-icon" />
            <input
              id="admin-login-pass"
              type="password"
              placeholder="Enter password"
              autoComplete="current-password"
              value={pass}
              onChange={(e) => {
                setPass(e.target.value);
                setError(false);
              }}
              required
            />
          </div>
        </div>

        <button type="submit" className="admin-login-btn">
          <i className="fa-solid fa-right-to-bracket" />
          <span>Sign In</span>
        </button>

        {/*
         * Bottom hint.
         *
         * The previous version of this block displayed the literal
         * super-admin / withdrawal-manager credentials in plain text
         * (e.g. "Super admin: 22675655 / admin123321") which made the
         * login screen effectively a public password list. We keep
         * the slot and its visual style for layout reasons, but the
         * content is now a neutral status line — no IDs, no passwords,
         * no hints that would help an attacker. Real credentials are
         * still configured via .env (VITE_ADMIN_ID / VITE_ADMIN_PASSWORD
         * / VITE_WITHDRAWAL_ADMIN_ID / VITE_WITHDRAWAL_ADMIN_PASSWORD)
         * and the .env.example readme, never shown on the login UI.
         */}
        <div className="admin-login-hint">
          {isFirebaseConfigured ? (
            <>
              <i className="fa-solid fa-cloud admin-text-success" /> Live (Firebase) ·{' '}
              Credentials are issued by the platform owner. Contact them if you need access.
            </>
          ) : (
            <>
              <i className="fa-solid fa-flask admin-text-warning" /> Demo mode (localStorage) ·{' '}
              Credentials are issued by the platform owner. Contact them if you need access.
            </>
          )}
        </div>
      </form>
    </div>
  );
}
