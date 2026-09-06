import { useEffect, useState } from 'react';
import type { UserRecord } from '../../types/admin';
import { getDataStore } from '../../services/dataStore';
import { useAdminToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import { usePrompt } from './PromptModal';

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

interface UserEditModalProps {
  user: UserRecord;
  onClose: () => void;
  onSaved: (updated: UserRecord) => void;
}

export function UserEditModal({ user, onClose, onSaved }: UserEditModalProps) {
  const store = getDataStore();
  const toast = useAdminToast();
  const { showConfirm, confirmNode } = useConfirm();
  const { showPrompt, promptNode } = usePrompt();

  const [name, setName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || user.uid);
  const [balance, setBalance] = useState(parseFloat(String(user.balance || 0)).toFixed(2));
  const [income, setIncome] = useState(parseFloat(String(user.income || 0)).toFixed(2));
  const [commission, setCommission] = useState(
    parseFloat(String(user.commission || 0)).toFixed(2),
  );
  const [spins, setSpins] = useState(String(user.spins || 0));
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [refCode, setRefCode] = useState(user.refCode || '');
  const [referredBy, setReferredBy] = useState(user.referredBy || '');
  const [bankName, setBankName] = useState(user.bankInfo?.bankName || '');
  const [accName, setAccName] = useState(user.bankInfo?.accName || '');
  const [accNum, setAccNum] = useState(user.bankInfo?.accNum || '');

  const [depositCount, setDepositCount] = useState(0);
  const [withdrawCount, setWithdrawCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [deps, wds] = await Promise.all([
        store.listDeposits(),
        store.listWithdrawals(),
      ]);
      if (!alive) return;
      setDepositCount(deps.filter((d) => d.user === user.uid).length);
      setWithdrawCount(wds.filter((w) => w.user === user.uid).length);
    };
    load();
    return () => {
      alive = false;
    };
  }, [store, user.uid]);

  const initial = (name || phone || 'U').charAt(0).toUpperCase();
  const planCount = user.plans ? Object.keys(user.plans).length : 0;

  const save = async () => {
    const updates: Partial<UserRecord> = {
      name: name.trim(),
      phone: phone.trim(),
      balance: parseFloat(balance) || 0,
      income: parseFloat(income) || 0,
      commission: parseFloat(commission) || 0,
      spins: parseInt(spins, 10) || 0,
      refCode: refCode.trim(),
      referredBy: referredBy.trim() || 'admin',
    };
    if (password) updates.password = password;
    if (bankName || accName || accNum) {
      updates.bankInfo = { bankName, accName, accNum };
    }
    try {
      await store.upsertUser(user.uid, updates);
      toast('User updated successfully', 'success');
      onSaved({ ...user, ...updates });
    } catch (e) {
      toast(`Error: ${(e as Error).message}`, 'error');
    }
  };

  const handleAdd = async () => {
    const v = await showPrompt({
      title: 'Add Balance',
      label: 'Amount to ADD (BDT)',
      placeholder: '100',
      defaultValue: '100',
      type: 'number',
    });
    if (v == null) return;
    const amt = parseFloat(v);
    if (!Number.isFinite(amt) || amt === 0) return toast('Invalid amount', 'error');
    const newBal = (parseFloat(balance) || 0) + amt;
    await store.upsertUser(user.uid, { balance: newBal });
    setBalance(newBal.toFixed(2));
    toast(`Added ${fmt(amt)} BDT. New balance: ${fmt(newBal)} BDT`, 'success');
  };

  const handleDeduct = async () => {
    const v = await showPrompt({
      title: 'Deduct Balance',
      label: 'Amount to DEDUCT (BDT)',
      placeholder: '50',
      defaultValue: '50',
      type: 'number',
    });
    if (v == null) return;
    const amt = parseFloat(v);
    if (!Number.isFinite(amt) || amt === 0) return toast('Invalid amount', 'error');
    const cur = parseFloat(balance) || 0;
    if (amt > cur) {
      const ok = await showConfirm({
        title: 'Insufficient Balance',
        heading: 'Set balance to 0?',
        message: `User only has ${fmt(cur)} BDT. Deducting ${fmt(amt)} would result in negative balance.`,
        confirmText: 'Set to 0',
        danger: true,
      });
      if (!ok) return;
      await store.upsertUser(user.uid, { balance: 0 });
      setBalance('0.00');
      toast('Balance set to 0', 'success');
      return;
    }
    const newBal = cur - amt;
    await store.upsertUser(user.uid, { balance: newBal });
    setBalance(newBal.toFixed(2));
    toast(`Deducted ${fmt(amt)} BDT. New balance: ${fmt(newBal)} BDT`, 'success');
  };

  const handleResetPwd = async () => {
    const v = await showPrompt({
      title: 'Reset Password',
      label: 'New Password',
      placeholder: 'Enter new password',
      type: 'text',
    });
    if (v == null) return;
    if (!v) return toast('Password cannot be empty', 'error');
    await store.upsertUser(user.uid, { password: v });
    setPassword(v);
    toast('Password reset successfully', 'success');
  };

  const handleToggleBan = async () => {
    const isBanned = !!user.banned;
    const action = isBanned ? 'unban' : 'ban';
    const ok = await showConfirm({
      title: isBanned ? 'Unban User' : 'Ban User',
      heading: `${action.charAt(0).toUpperCase() + action.slice(1)} this user?`,
      message: isBanned
        ? 'This user will regain access to the platform.'
        : 'This user will be blocked from using the platform.',
      confirmText: isBanned ? 'Unban' : 'Ban',
      danger: !isBanned,
    });
    if (!ok) return;
    await store.setUserBanned(user.uid, !isBanned);
    toast(`User ${isBanned ? 'unbanned' : 'banned'} successfully`, 'success');
    onSaved({ ...user, banned: !isBanned });
  };

  const handleDelete = async () => {
    const ok = await showConfirm({
      title: 'Delete User',
      heading: 'PERMANENTLY DELETE this user?',
      message: `User "${user.name || user.uid}" and all their data will be erased. This cannot be undone!`,
      confirmText: 'Delete Forever',
      danger: true,
    });
    if (!ok) return;
    await store.deleteUser(user.uid);
    toast('User deleted', 'success');
    onClose();
  };

  const copyPwd = async () => {
    if (!password) return toast('No password to copy', 'warning');
    try {
      await navigator.clipboard.writeText(password);
      toast('Password copied', 'success');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = password;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        toast('Password copied', 'success');
      } catch {
        toast('Copy failed', 'error');
      }
      document.body.removeChild(ta);
    }
  };

  return (
    <>
      <div
        className="admin-modal-backdrop show"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="admin-modal wide">
          <div className="admin-modal-header">
            <h2>
              <i className="fa-solid fa-user-pen" /> Edit User
            </h2>
            <button className="admin-modal-close" onClick={onClose} aria-label="Close">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
          <div className="admin-modal-body">
            <div className="admin-ue-hero">
              <div className="admin-ue-avatar">{initial}</div>
              <div className="admin-ue-info">
                <div className="admin-ue-name">{name || 'Unnamed'}</div>
                <div className="admin-ue-sub">
                  <i className="fa-solid fa-phone" /> {phone || user.uid} · Joined{' '}
                  {fmtDate(user.joinedAt)}
                </div>
              </div>
              {user.banned && (
                <span className="admin-badge danger">
                  <i className="fa-solid fa-ban" /> Banned
                </span>
              )}
            </div>

            <div className="admin-ue-stats">
              <div className="admin-ue-stat">
                <div className="ad-v">{planCount}</div>
                <div className="ad-k">Plans</div>
              </div>
              <div className="admin-ue-stat">
                <div className="ad-v">{depositCount}</div>
                <div className="ad-k">Deposits</div>
              </div>
              <div className="admin-ue-stat">
                <div className="ad-v">{withdrawCount}</div>
                <div className="ad-k">Withdrawals</div>
              </div>
            </div>

            <div className="admin-quick-actions">
              <button className="admin-btn btn-success admin-flex-1" onClick={handleAdd}>
                <i className="fa-solid fa-plus" /> Add Balance
              </button>
              <button className="admin-btn btn-danger admin-flex-1" onClick={handleDeduct}>
                <i className="fa-solid fa-minus" /> Deduct
              </button>
              <button className="admin-btn btn-secondary admin-flex-1" onClick={handleResetPwd}>
                <i className="fa-solid fa-key" /> Reset Pwd
              </button>
              <button
                className={`admin-btn ${user.banned ? 'btn-success' : 'btn-danger'} admin-flex-1`}
                onClick={handleToggleBan}
              >
                <i className={`fa-solid ${user.banned ? 'fa-unlock' : 'fa-ban'}`} />{' '}
                {user.banned ? 'Unban' : 'Ban'}
              </button>
            </div>

            <div className="admin-section-title">
              <i className="fa-solid fa-id-card" /> Profile
            </div>
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">Name</label>
                <input className="admin-form-input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="admin-form-group">
                <label className="ad-label">Phone</label>
                <input className="admin-form-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>

            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">Balance (BDT)</label>
                <input
                  className="admin-form-input"
                  type="number"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                />
              </div>
              <div className="admin-form-group">
                <label className="ad-label">Income (BDT)</label>
                <input
                  className="admin-form-input"
                  type="number"
                  value={income}
                  onChange={(e) => setIncome(e.target.value)}
                />
              </div>
            </div>

            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">Commission (BDT)</label>
                <input
                  className="admin-form-input"
                  type="number"
                  value={commission}
                  onChange={(e) => setCommission(e.target.value)}
                />
              </div>
              <div className="admin-form-group">
                <label className="ad-label">Spins</label>
                <input
                  className="admin-form-input"
                  type="number"
                  value={spins}
                  onChange={(e) => setSpins(e.target.value)}
                />
              </div>
            </div>

            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">Password</label>
                <div className="admin-pwd-wrap">
                  <input
                    className="admin-form-input"
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    placeholder={user.password ? `Current: ${user.password}` : '(no password set)'}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {password && (
                    <button type="button" className="ad-copy" onClick={copyPwd} title="Copy password">
                      <i className="fa-regular fa-copy" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="ad-eye"
                    onClick={() => setShowPwd((v) => !v)}
                    title={showPwd ? 'Hide' : 'Show'}
                  >
                    <i className={`fa-solid ${showPwd ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
              </div>
              <div className="admin-form-group">
                <label className="ad-label">Ref Code</label>
                <input className="admin-form-input" value={refCode} onChange={(e) => setRefCode(e.target.value)} />
              </div>
            </div>

            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">Referred By</label>
                <input
                  className="admin-form-input"
                  value={referredBy}
                  onChange={(e) => setReferredBy(e.target.value)}
                  placeholder="inviter phone or code"
                />
              </div>
              <div className="admin-form-group" />
            </div>

            <div className="admin-section-title">
              <i className="fa-solid fa-building-columns" /> Bank Info
            </div>
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">Bank Name</label>
                <input className="admin-form-input" value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </div>
              <div className="admin-form-group">
                <label className="ad-label">Account Holder</label>
                <input className="admin-form-input" value={accName} onChange={(e) => setAccName(e.target.value)} />
              </div>
            </div>
            <div className="admin-form-row admin-form-row full">
              <div className="admin-form-group">
                <label className="ad-label">Account Number</label>
                <input className="admin-form-input" value={accNum} onChange={(e) => setAccNum(e.target.value)} />
              </div>
            </div>

            {user.plans && Object.keys(user.plans).length > 0 && (
              <>
                <div className="admin-section-title">
                  <i className="fa-solid fa-boxes-stacked" /> Active Plans
                </div>
                {Object.entries(user.plans).map(([pk, p]) => (
                  <div className="admin-list-card" key={pk}>
                    <div className="ad-left">
                      <span className="ad-ttl">{p.name || 'Plan'}</span>
                      <span className="ad-sub">
                        Day {p.daysClaimed || 0} / {p.duration || 0}{' '}
                        {p.active ? '· Active' : '· Completed'}
                      </span>
                    </div>
                    <div className="ad-right">
                      <div className="ad-ttl">BDT {fmt(p.dailyIncome || 0)} / day</div>
                      <div className="ad-sub">{fmt(p.price || 0)} BDT price</div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="admin-modal-footer">
            <button className="admin-btn btn-danger" onClick={handleDelete} title="Delete user permanently">
              <i className="fa-solid fa-trash" /> Delete
            </button>
            <div style={{ flex: 1 }} />
            <button className="admin-btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="admin-btn btn-success" onClick={save}>
              <i className="fa-solid fa-floppy-disk" /> Save Changes
            </button>
          </div>
        </div>
      </div>
      {confirmNode}
      {promptNode}
    </>
  );
}
