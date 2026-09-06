import { useEffect, useState } from 'react';
import { getDataStore } from '../../services/dataStore';
import type { GiftCodeRecord } from '../../types/admin';
import { useAdminToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmModal';

const fmt = (n: number | string | undefined, d = 2) => {
  const v = parseFloat(String(n ?? 0));
  return (Number.isFinite(v) ? v : 0).toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
};
const fmtDateTime = (ts?: number | null) => {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
};

export function GiftsSection({ active }: { active: boolean }) {
  const store = getDataStore();
  const [codes, setCodes] = useState<GiftCodeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [expiry, setExpiry] = useState('');
  const toast = useAdminToast();
  const { showConfirm, confirmNode } = useConfirm();

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = async () => {
      const list = await store.listGiftCodes();
      if (!alive) return;
      setCodes(list);
      setLoading(false);
    };
    load();
    const off = store.onGiftCodesChange((rows) => {
      if (!alive) return;
      setCodes(rows);
      setLoading(false);
    });
    return () => {
      alive = false;
      off();
    };
  }, [active, store]);

  const create = async () => {
    const c = code.trim().toUpperCase();
    const minAmt = parseFloat(min);
    const maxAmt = parseFloat(max);
    const expMinutes = parseInt(expiry, 10) || 0;
    if (!c) return toast('Please enter a code name', 'error');
    if (!Number.isFinite(minAmt) || minAmt <= 0) return toast('Please enter a valid min reward', 'error');
    if (!Number.isFinite(maxAmt) || maxAmt <= 0) return toast('Please enter a valid max reward', 'error');
    if (minAmt > maxAmt) return toast('Min must be less than max', 'error');

    const amt = (Math.random() * (maxAmt - minAmt) + minAmt).toFixed(2);

    try {
      await store.createGiftCode({
        key: c,
        amount: parseFloat(amt),
        expiresAt: expMinutes > 0 ? Date.now() + expMinutes * 60_000 : null,
      });
      toast(`Gift code published! Reward: ${amt} BDT`, 'success');
      setCode('');
      setMin('');
      setMax('');
      setExpiry('');
    } catch (e) {
      toast(`Error: ${(e as Error).message}`, 'error');
    }
  };

  const remove = async (c: GiftCodeRecord) => {
    const ok = await showConfirm({
      title: 'Delete Gift Code',
      heading: 'Delete this gift code?',
      message: 'Users will no longer be able to redeem it.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await store.deleteGiftCode(c.key);
    toast('Gift code deleted', 'success');
  };

  return (
    <>
      <div className="admin-page-header">
        <h1>
          <i className="fa-solid fa-gift" /> Gift Codes
        </h1>
        <p>Create gift codes that users can redeem for bonus balance.</p>
      </div>
      <div className="admin-page-content">
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>
              <i className="fa-solid fa-plus" /> Create Gift Code
            </h3>
          </div>
          <div className="admin-card-body">
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">
                  Code <span className="ad-req">*</span>
                </label>
                <input
                  className="admin-form-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. PROMO2025"
                  style={{ fontFamily: "'Courier New', monospace", letterSpacing: '1px' }}
                />
              </div>
              <div className="admin-form-group">
                <label className="ad-label">Expiry (minutes, 0=never)</label>
                <input
                  type="number"
                  min={0}
                  className="admin-form-input"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  placeholder="e.g. 60"
                />
              </div>
            </div>
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">
                  Min Reward (BDT) <span className="ad-req">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="admin-form-input"
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                  placeholder="e.g. 10"
                />
              </div>
              <div className="admin-form-group">
                <label className="ad-label">
                  Max Reward (BDT) <span className="ad-req">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="admin-form-input"
                  value={max}
                  onChange={(e) => setMax(e.target.value)}
                  placeholder="e.g. 100"
                />
              </div>
            </div>
            <p className="admin-form-help">
              <i className="fa-solid fa-circle-info" /> A random reward between
              Min and Max is generated and locked to the code.
            </p>
            <div style={{ marginTop: 12 }}>
              <button className="admin-btn btn-success" onClick={create}>
                <i className="fa-solid fa-paper-plane" /> Publish Code
              </button>
            </div>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <h3>
              <i className="fa-solid fa-list" /> Code List ({codes.length})
            </h3>
          </div>
          <div className="admin-card-body">
            {loading ? (
              <div className="admin-loading">
                <i className="fa-solid fa-spinner fa-spin" />
                <p>Loading codes...</p>
              </div>
            ) : codes.length === 0 ? (
              <div className="admin-empty">
                <i className="fa-solid fa-gift" />
                <h4>No gift codes yet</h4>
                <p>Create your first gift code above.</p>
              </div>
            ) : (
              codes.map((c) => {
                const isActive = c.status === 'active' && (!c.expiresAt || c.expiresAt > Date.now());
                const statusClass = isActive ? 'success' : 'muted';
                const statusText = isActive ? 'Active' : c.status === 'used' ? 'Used' : 'Expired';
                const expiryText = c.expiresAt
                  ? `Expires: ${fmtDateTime(c.expiresAt)}`
                  : 'No expiry';
                return (
                  <div className="admin-list-card" key={c.key}>
                    <div className="ad-left">
                      <span
                        className="ad-ttl"
                        style={{ fontFamily: "'Courier New', monospace", letterSpacing: '1px' }}
                      >
                        {c.key}
                      </span>
                      <span className="ad-sub">
                        Created: {fmtDateTime(c.createdAt)} · {expiryText}
                        {c.usedBy && (
                          <>
                            {' '}
                            · Used by <b>{c.usedBy}</b>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="ad-right">
                      <div className="ad-ttl admin-text-success">{fmt(c.amount)} BDT</div>
                      <span className={`admin-badge ${statusClass}`}>{statusText}</span>
                    </div>
                    <button
                      className="admin-btn-icon danger"
                      title="Delete"
                      onClick={() => remove(c)}
                    >
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      {confirmNode}
    </>
  );
}
