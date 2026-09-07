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

// Generate a short, easy-to-share random code. We avoid ambiguous
// characters (0/O, 1/I/L) so users can read it off a chat message
// without typing the wrong letter.
const generateCode = (): string => {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `GIFT-${out.slice(0, 4)}-${out.slice(4)}`;
};

export function GiftsSection({ active }: { active: boolean }) {
  const store = getDataStore();
  const [codes, setCodes] = useState<GiftCodeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // Form state. The reward is a single fixed Birr amount (not a
  // min/max range) so the admin can publish predictable gift values
  // and copy them to users without surprise. `maxUses` caps how
  // many distinct users may redeem the code before it auto-closes.
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('');
  const [maxUses, setMaxUses] = useState('1');
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
    const amt = parseFloat(amount);
    const max = parseInt(maxUses, 10) || 1;
    const expMinutes = parseInt(expiry, 10) || 0;
    if (!c) return toast('Please enter a code name', 'error');
    if (!Number.isFinite(amt) || amt <= 0) return toast('Please enter a valid reward amount', 'error');
    if (max < 1) return toast('Max uses must be at least 1', 'error');
    try {
      await store.createGiftCode({
        key: c,
        amount: amt,
        maxUses: max,
        expiresAt: expMinutes > 0 ? Date.now() + expMinutes * 60_000 : null,
      });
      toast(`Gift code published — ${fmt(amt)} BDT × ${max} user${max === 1 ? '' : 's'}`, 'success');
      setCode('');
      setAmount('');
      setMaxUses('1');
      setExpiry('');
    } catch (e) {
      toast(`Error: ${(e as Error).message}`, 'error');
    }
  };

  const remove = async (c: GiftCodeRecord) => {
    const ok = await showConfirm({
      title: 'Delete Gift Code',
      heading: 'Delete this gift code?',
      message: `Users will no longer be able to redeem "${c.key}".`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await store.deleteGiftCode(c.key);
    toast('Gift code deleted', 'success');
  };

  // One-click copy of the code to the clipboard so the admin can
  // paste it into a chat / email and send it to users in seconds.
  const copyCode = async (c: GiftCodeRecord) => {
    try {
      await navigator.clipboard.writeText(c.key);
      toast(`Copied "${c.key}"`, 'success', 1500);
    } catch {
      // Fallback for non-secure contexts where the Clipboard API
      // is unavailable: stage the value in a hidden textarea and
      // run the legacy copy command.
      const ta = document.createElement('textarea');
      ta.value = c.key;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        toast(`Copied "${c.key}"`, 'success', 1500);
      } catch {
        toast('Copy failed', 'error');
      }
      document.body.removeChild(ta);
    }
  };

  return (
    <>
      <div className="admin-page-header">
        <h1>
          <i className="fa-solid fa-gift" /> Gift Codes
        </h1>
        <p>Create fixed-value gift codes that up to N users can redeem for bonus balance.</p>
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
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="admin-form-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. GIFT-AB23-CD45"
                    style={{ fontFamily: "'Courier New', monospace", letterSpacing: '1px', flex: 1 }}
                  />
                  <button
                    type="button"
                    className="admin-btn btn-secondary"
                    onClick={() => setCode(generateCode())}
                    title="Generate a random code"
                  >
                    <i className="fa-solid fa-shuffle" /> Generate
                  </button>
                </div>
              </div>
              <div className="admin-form-group">
                <label className="ad-label">
                  Reward (Birr) <span className="ad-req">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="admin-form-input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 50"
                />
              </div>
            </div>
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">
                  Max users who can claim <span className="ad-req">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  step="1"
                  className="admin-form-input"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="e.g. 100"
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
            <p className="admin-form-help">
              <i className="fa-solid fa-circle-info" /> Each user can only claim a given code once. The code
              auto-closes when it reaches its max uses or expires.
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
                const claimed =
                  (Array.isArray(c.usedByList) ? c.usedByList.length : 0) ||
                  (c.usedBy ? 1 : 0);
                const max = typeof c.maxUses === 'number' && c.maxUses > 0 ? c.maxUses : 1;
                const expired = c.expiresAt ? c.expiresAt < Date.now() : false;
                const isActive = c.status === 'active' && !expired && claimed < max;
                const isFullyClaimed = claimed >= max;
                const statusClass = isActive
                  ? 'success'
                  : isFullyClaimed
                  ? 'muted'
                  : 'danger';
                const statusText = isActive
                  ? 'Active'
                  : isFullyClaimed
                  ? 'Fully claimed'
                  : expired
                  ? 'Expired'
                  : 'Closed';
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
                        Created: {fmtDateTime(c.createdAt)} · {expiryText} · Claimed {claimed} / {max}
                      </span>
                    </div>
                    <div className="ad-right">
                      <div className="ad-ttl admin-text-success">{fmt(c.amount)} BDT</div>
                      <span className={`admin-badge ${statusClass}`}>{statusText}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                      <button
                        className="admin-btn-icon"
                        title="Copy code"
                        onClick={() => copyCode(c)}
                      >
                        <i className="fa-regular fa-copy" />
                      </button>
                      <button
                        className="admin-btn-icon danger"
                        title="Delete"
                        onClick={() => remove(c)}
                      >
                        <i className="fa-solid fa-trash" />
                      </button>
                    </div>
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
