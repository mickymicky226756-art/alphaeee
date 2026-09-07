import { useEffect, useMemo, useState } from 'react';
import { getDataStore } from '../../services/dataStore';
import type { UserRecord } from '../../types/admin';
import { UserEditModal } from '../components/UserEditModal';
import { GivePlanModal } from '../components/GivePlanModal';
import { useConfirm } from '../components/ConfirmModal';
import { useAdminToast } from '../components/Toast';

const fmt = (n: number | string | undefined, d = 2) => {
  const v = parseFloat(String(n ?? 0));
  return (Number.isFinite(v) ? v : 0).toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
};
const fmtDate = (ts?: number) => {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

type Filter = 'all' | 'active' | 'banned' | 'top';

export function UsersSection({ active }: { active: boolean }) {
  const store = useMemo(() => getDataStore(), []);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [givingPlan, setGivingPlan] = useState<UserRecord | null>(null);
  const toast = useAdminToast();
  const { showConfirm, confirmNode } = useConfirm();

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = async () => {
      const list = await store.listUsers();
      if (!alive) return;
      setUsers(list);
      setLoading(false);
    };
    load();
    const off = store.onUsersChange((u) => {
      if (!alive) return;
      setUsers(u);
      setLoading(false);
    });
    return () => {
      alive = false;
      off();
    };
  }, [active, store]);

  const filtered = useMemo(() => {
    let out = users.slice();
    const s = search.toLowerCase().trim();
    if (s) {
      out = out.filter((u) => {
        const phone = (u.phone || u.uid || '').toLowerCase();
        const name = (u.name || '').toLowerCase();
        const ref = (u.refCode || '').toLowerCase();
        const refBy = (u.referredBy || '').toLowerCase();
        return phone.includes(s) || name.includes(s) || ref.includes(s) || refBy.includes(s);
      });
    }
    if (filter === 'active') out = out.filter((u) => !u.banned);
    else if (filter === 'banned') out = out.filter((u) => !!u.banned);
    else if (filter === 'top')
      out = out
        .sort((a, b) => (parseFloat(String(b.balance)) || 0) - (parseFloat(String(a.balance)) || 0))
        .slice(0, 50);

    out.sort((a, b) => {
      if (a.banned && !b.banned) return 1;
      if (!a.banned && b.banned) return -1;
      return (parseFloat(String(b.balance)) || 0) - (parseFloat(String(a.balance)) || 0);
    });
    return out;
  }, [users, search, filter]);

  const handleQuickBan = async (u: UserRecord) => {
    const isBanned = !!u.banned;
    const ok = await showConfirm({
      title: isBanned ? 'Unban User' : 'Ban User',
      heading: `${isBanned ? 'Unban' : 'Ban'} this user?`,
      message: isBanned
        ? 'This user will regain access to the platform.'
        : 'This user will be blocked from using the platform.',
      confirmText: isBanned ? 'Unban' : 'Ban',
      danger: !isBanned,
    });
    if (!ok) return;
    await store.setUserBanned(u.uid, !isBanned);
    toast(`User ${isBanned ? 'unbanned' : 'banned'} successfully`, 'success');
  };

  return (
    <>
      <div className="admin-page-header">
        <h1>
          <i className="fa-solid fa-users" /> User Management
        </h1>
        <p>Search, view and manage all registered users.</p>
      </div>
      <div className="admin-page-content">
        <div className="admin-card">
          <div className="admin-card-body">
            <div className="admin-form-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <div className="admin-search-input">
                <i className="fa-solid fa-magnifying-glass" />
                <input
                  className="admin-form-input"
                  placeholder="Search by phone, name, or referral code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button
                className="admin-btn btn-secondary"
                onClick={async () => {
                  setLoading(true);
                  const list = await store.listUsers();
                  setUsers(list);
                  setLoading(false);
                  toast('Refreshed', 'success', 1200);
                }}
              >
                <i className="fa-solid fa-arrows-rotate" /> Refresh
              </button>
            </div>

            <div className="admin-filter-pills admin-mb-2">
              {(['all', 'active', 'banned', 'top'] as const).map((f) => (
                <button
                  key={f}
                  className={`admin-filter-pill ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' && 'All'}
                  {f === 'active' && 'Active'}
                  {f === 'banned' && 'Banned'}
                  {f === 'top' && 'Top Balance'}
                </button>
              ))}
            </div>

            <div className="admin-flex admin-justify-between admin-items-center admin-mb-1" style={{ fontSize: '0.85rem', color: '#64748b' }}>
              <span>{filtered.length} user{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Phone</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="empty-cell">
                        <div className="admin-loading">
                          <i className="fa-solid fa-spinner fa-spin" />
                          <p>Loading users...</p>
                        </div>
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty-cell">
                        <div className="admin-empty">
                          <i className="fa-solid fa-user-slash" />
                          <h4>No users found</h4>
                          <p>Try a different search or filter.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((u) => {
                      const initial = (u.name || u.phone || 'U').charAt(0).toUpperCase();
                      const isBanned = !!u.banned;
                      return (
                        <tr key={u.uid}>
                          <td>
                            <div className="admin-user-cell">
                              <div className={`admin-table-avatar ${isBanned ? 'banned' : ''}`}>
                                {initial}
                              </div>
                              <div>
                                <div className="ad-name">{u.name || 'Unnamed'}</div>
                                <div className="ad-phone">{u.phone || u.uid}</div>
                              </div>
                            </div>
                          </td>
                          <td>{u.phone || u.uid}</td>
                          <td>
                            <strong>{fmt(u.balance)}</strong>{' '}
                            <small style={{ color: '#64748b' }}>BDT</small>
                          </td>
                          <td>
                            {isBanned ? (
                              <span className="admin-badge danger">
                                <i className="fa-solid fa-ban" /> Banned
                              </span>
                            ) : (
                              <span className="admin-badge success">
                                <i className="fa-solid fa-circle-check" /> Active
                              </span>
                            )}
                          </td>
                          <td>{fmtDate(u.joinedAt)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="admin-btn-icon"
                              title="Edit"
                              onClick={() => setEditing(u)}
                            >
                              <i className="fa-solid fa-pen" />
                            </button>
                            <button
                              className="admin-btn-icon"
                              title="Assign investment plan"
                              onClick={() => setGivingPlan(u)}
                              style={{ marginLeft: 4 }}
                              disabled={isBanned}
                            >
                              <i className="fa-solid fa-gift" />
                            </button>
                            <button
                              className={`admin-btn-icon ${isBanned ? '' : 'danger'}`}
                              title={isBanned ? 'Unban' : 'Ban'}
                              onClick={() => handleQuickBan(u)}
                              style={{ marginLeft: 4 }}
                            >
                              <i className={`fa-solid ${isBanned ? 'fa-unlock' : 'fa-ban'}`} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <UserEditModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setUsers((cur) => cur.map((u) => (u.uid === updated.uid ? { ...u, ...updated } : u)));
            setEditing(null);
          }}
        />
      )}
      {givingPlan && (
        <GivePlanModal
          user={givingPlan}
          onClose={() => setGivingPlan(null)}
          onAssigned={() => {
            // The data store's onUsersChange subscription will
            // refresh the table automatically; this callback is
            // just a hook in case the modal needs to do extra
            // bookkeeping in the future.
          }}
        />
      )}
      {confirmNode}
    </>
  );
}
