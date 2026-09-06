import { useEffect, useState } from 'react';
import { AdminLogin } from './AdminLogin';
import { AdminShell } from './AdminShell';
import { AdminToastHost } from './components/Toast';
import { readSession, type AdminRole } from './adminAuth';

export function AdminApp() {
  const [loggedIn, setLoggedIn] = useState<boolean>(false);
  // The role is captured at login time. The session tag is the
  // source of truth: even if a sub-admin navigates back to /admin
  // with a stale tab, they still only get withdrawals access.
  const [role, setRole] = useState<AdminRole>('super');
  const [hydrated, setHydrated] = useState<boolean>(false);

  useEffect(() => {
    const s = readSession();
    if (s) {
      setRole(s.role);
      setLoggedIn(true);
    }
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return <div className="admin-root" />;
  }

  return (
    <AdminToastHost>
      <div className="admin-root">
        {loggedIn ? (
          <AdminShell
            role={role}
            onLogout={() => {
              setLoggedIn(false);
              // Keep the last role in state so a re-login as the
              // same user reuses the same view default.
            }}
          />
        ) : (
          <AdminLogin
            onSuccess={(r) => {
              setRole(r);
              setLoggedIn(true);
            }}
          />
        )}
      </div>
    </AdminToastHost>
  );
}
