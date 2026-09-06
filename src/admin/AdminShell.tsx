import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardSection } from './sections/Dashboard';
import { UsersSection } from './sections/Users';
import { TransactionsSection } from './sections/Transactions';
import { PlansSection } from './sections/Plans';
import { BanksSection } from './sections/Banks';
import { GiftsSection } from './sections/Gifts';
import { SettingsSection } from './sections/Settings';
import { getDataStore } from '../services/dataStore';
import { clearSession, type AdminRole } from './adminAuth';
import { useConfirm } from './components/ConfirmModal';
import { useAdminToast } from './components/Toast';
import { ENV, isFirebaseConfigured } from '../config/env';

type SectionKey =
  | 'dashboard'
  | 'users'
  | 'transactions'
  | 'plans'
  | 'banks'
  | 'gifts'
  | 'settings';

interface NavItem {
  key: SectionKey;
  icon: string;
  label: string;
  group: string;
}

const NAV: NavItem[] = [
  { key: 'dashboard', icon: 'fa-chart-line', label: 'Dashboard', group: 'Main' },
  { key: 'users', icon: 'fa-users', label: 'Users', group: 'Main' },
  { key: 'transactions', icon: 'fa-money-bill-transfer', label: 'Transactions', group: 'Main' },
  { key: 'plans', icon: 'fa-boxes-stacked', label: 'Investment Plans', group: 'Manage' },
  { key: 'banks', icon: 'fa-building-columns', label: 'Bank Accounts', group: 'Manage' },
  { key: 'gifts', icon: 'fa-gift', label: 'Gift Codes', group: 'Manage' },
  { key: 'settings', icon: 'fa-gear', label: 'Settings', group: 'System' },
];

const PAGE_TITLES: Record<SectionKey, [string, string]> = {
  dashboard: ['Dashboard', 'fa-chart-line'],
  users: ['Users', 'fa-users'],
  transactions: ['Transactions', 'fa-money-bill-transfer'],
  plans: ['Investment Plans', 'fa-boxes-stacked'],
  banks: ['Bank Accounts', 'fa-building-columns'],
  gifts: ['Gift Codes', 'fa-gift'],
  settings: ['Settings', 'fa-gear'],
};

interface AdminShellProps {
  role: AdminRole;
  onLogout: () => void;
}

export function AdminShell({ role, onLogout }: AdminShellProps) {
  // For sub-admins (role === 'withdrawals') the navigation collapses
  // down to a single Withdrawals view: they get the Transactions
  // section in withdrawals-only mode and nothing else.
  const isSubAdmin = role === 'withdrawals';
  const visibleNav = useMemo(
    () => (isSubAdmin ? NAV.filter((n) => n.key === 'transactions') : NAV),
    [isSubAdmin],
  );
  // Sub-admin lands directly on the Transactions section so they
  // never see the Dashboard or any non-transaction content.
  const [section, setSection] = useState<SectionKey>(
    isSubAdmin ? 'transactions' : 'dashboard',
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // The notification bell + the side-nav badge are meaningful only
  // for the super admin (deposits + withdrawals + plans + gifts).
  // For the sub-admin we still surface the pending-withdrawal count
  // so they can see at a glance how many withdrawals need review.
  const [pendingCount, setPendingCount] = useState(0);
  const toast = useAdminToast();
  const { showConfirm, confirmNode } = useConfirm();
  const store = useMemo(() => getDataStore(), []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      Promise.all([store.listDeposits(), store.listWithdrawals()]).then(([d, w]) => {
        if (!active) return;
        // Sub-admin only cares about pending withdrawals; super admin
        // wants the combined deposit + withdrawal pending total.
        const n = isSubAdmin
          ? w.filter((x) => x.status === 'pending').length
          : d.filter((x) => x.status === 'pending').length +
            w.filter((x) => x.status === 'pending').length;
        setPendingCount(n);
      });
    };
    refresh();
    const u1 = store.onDepositsChange(refresh);
    const u2 = store.onWithdrawalsChange(refresh);
    return () => {
      active = false;
      u1();
      u2();
    };
  }, [store, isSubAdmin]);

  // Listen for "Quick Action" navigation requests from the Dashboard.
  // The Dashboard section is only rendered for the super admin, so
  // this listener is harmless for sub-admins, but we still verify
  // the target is in the *visible* nav before switching.
  useEffect(() => {
    const onGoTo = (e: Event) => {
      const target = (e as CustomEvent<string>).detail;
      if (
        target &&
        visibleNav.find((n) => n.key === target)
      ) {
        setSection(target as SectionKey);
        setSidebarOpen(false);
      }
    };
    window.addEventListener('admin-go-to', onGoTo);
    return () => window.removeEventListener('admin-go-to', onGoTo);
  }, [visibleNav]);

  const goTo = useCallback(
    (s: SectionKey) => {
      // Belt-and-braces: refuse to navigate to a section the role
      // is not allowed to see, even if a stale UI somehow offered it.
      if (!visibleNav.find((n) => n.key === s)) return;
      setSection(s);
      setSidebarOpen(false);
    },
    [visibleNav],
  );

  const toggleSidebar = () => setSidebarOpen((v) => !v);

  const refreshCurrent = () => {
    toast('Refreshed', 'success', 1500);
    setSection((cur) => cur);
  };

  const handleLogout = async () => {
    const ok = await showConfirm({
      title: 'Logout',
      heading: 'Logout?',
      message: 'You will be returned to the login screen.',
      confirmText: 'Logout',
    });
    if (!ok) return;
    clearSession();
    onLogout();
  };

  const grouped = useMemo(() => {
    const m = new Map<string, NavItem[]>();
    visibleNav.forEach((item) => {
      if (!m.has(item.group)) m.set(item.group, []);
      m.get(item.group)!.push(item);
    });
    return Array.from(m.entries());
  }, [visibleNav]);

  // Sub-admin gets a withdrawals-only render of the Transactions
  // page; super admin sees the full version.
  const [title, titleIcon] = PAGE_TITLES[section];
  const mode = store.mode;

  return (
    <div className="admin-app">
      <header className="admin-top-header">
        <button className="admin-menu-btn" onClick={toggleSidebar} aria-label="Open menu">
          <i className="fa-solid fa-bars" />
        </button>
        <div className="admin-page-title">
          <i className={`fa-solid ${titleIcon} admin-text-success`} />
          <span>{title}</span>
          <span className="ad-crumb">· {ENV.brandName} Admin</span>
        </div>
        <div className="admin-header-actions">
          <span
            className={`admin-mode-badge ${mode === 'firebase' ? 'firebase' : ''}`}
            title={mode === 'firebase' ? 'Connected to Firebase RTDB' : 'Demo mode (localStorage)'}
          >
            <i className={`fa-solid ${mode === 'firebase' ? 'fa-cloud' : 'fa-flask'}`} />
            {mode === 'firebase' ? 'Live' : 'Demo'}
          </span>
          {!isFirebaseConfigured && (
            <span
              className="admin-mode-badge"
              title="Fill VITE_FIREBASE_* in .env to enable live data"
            >
              <i className="fa-solid fa-triangle-exclamation" /> Set Firebase env
            </span>
          )}
          <button className="admin-icon-btn" title="Refresh" onClick={refreshCurrent}>
            <i className="fa-solid fa-arrows-rotate" />
          </button>
          <button className="admin-icon-btn" title="Notifications">
            <i className="fa-solid fa-bell" />
            {pendingCount > 0 && <span className="ad-dot" />}
          </button>
          <div className="admin-header-user" onClick={handleLogout} title="Click to logout">
            <div className="ad-avatar">{isSubAdmin ? 'W' : 'A'}</div>
            <div className="admin-header-user-info">
              <span className="ad-name">
                {isSubAdmin ? 'Withdrawal Manager' : 'Administrator'}
              </span>
              <span className="ad-role">
                {isSubAdmin ? 'Withdrawals Only' : 'Super Admin'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="admin-body">
        <div
          className={`admin-sidebar-overlay ${sidebarOpen ? 'show' : ''}`}
          onClick={toggleSidebar}
        />
        <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="admin-sidebar-brand">
            <div className="ad-logo">
              <i className={isSubAdmin ? 'fa-solid fa-money-bill-wave' : 'fa-solid fa-shield-halved'} />
            </div>
            <div className="ad-text">
              <span className="ad-name">{ENV.brandName}</span>
              <span className="ad-ver">
                {isSubAdmin ? 'Withdrawals Console' : 'Admin Panel v2.0'}
              </span>
            </div>
          </div>

          <nav className="admin-sidebar-nav">
            {grouped.map(([group, items]) => (
              <div className="admin-nav-section" key={group}>
                <div className="admin-nav-section-title">{group}</div>
                {items.map((it) => {
                  const showBadge = it.key === 'transactions' && pendingCount > 0;
                  return (
                    <button
                      key={it.key}
                      className={`admin-nav-item ${section === it.key ? 'active' : ''}`}
                      onClick={() => goTo(it.key)}
                    >
                      <i className={`fa-solid ${it.icon}`} />
                      <span>{it.label}</span>
                      {showBadge && <span className="ad-nav-badge">{pendingCount}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="admin-sidebar-footer">
            <button className="admin-nav-item logout" onClick={handleLogout}>
              <i className="fa-solid fa-right-from-bracket" />
              <span>Logout</span>
            </button>
          </div>
        </aside>

        <main className="admin-main">
          {!isSubAdmin && (
            <section className={`admin-section ${section === 'dashboard' ? 'active' : ''}`}>
              <DashboardSection />
            </section>
          )}
          {!isSubAdmin && (
            <section className={`admin-section ${section === 'users' ? 'active' : ''}`}>
              <UsersSection active={section === 'users'} />
            </section>
          )}
          <section className={`admin-section ${section === 'transactions' ? 'active' : ''}`}>
            <TransactionsSection
              active={section === 'transactions'}
              withdrawalsOnly={isSubAdmin}
              defaultFilter={isSubAdmin ? 'pending' : 'pending'}
            />
          </section>
          {!isSubAdmin && (
            <section className={`admin-section ${section === 'plans' ? 'active' : ''}`}>
              <PlansSection active={section === 'plans'} />
            </section>
          )}
          {!isSubAdmin && (
            <section className={`admin-section ${section === 'banks' ? 'active' : ''}`}>
              <BanksSection active={section === 'banks'} />
            </section>
          )}
          {!isSubAdmin && (
            <section className={`admin-section ${section === 'gifts' ? 'active' : ''}`}>
              <GiftsSection active={section === 'gifts'} />
            </section>
          )}
          {!isSubAdmin && (
            <section className={`admin-section ${section === 'settings' ? 'active' : ''}`}>
              <SettingsSection active={section === 'settings'} />
            </section>
          )}
        </main>
      </div>

      {confirmNode}
    </div>
  );
}
