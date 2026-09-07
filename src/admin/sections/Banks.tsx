import { useEffect, useState } from 'react';
import { getDataStore } from '../../services/dataStore';
import type { BankRecord } from '../../types/admin';
import { useAdminToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmModal';

// Banks added here are the deposit accounts the user sees on the
// recharge page. The CBE gateway subscribes to this same node and
// picks the first enabled record whose `bankName` is exactly
// "CBE" or "Commercial Bank of Ethiopia" (case-insensitive). The
// hint below the form is there to make that match obvious so the
// admin doesn't accidentally create a record the gateway can't
// see.
const BANK_NAME_HINT = 'Must be "CBE" or "Commercial Bank of Ethiopia" so the gateway can find it.';

export function BanksSection({ active }: { active: boolean }) {
  const store = getDataStore();
  const [banks, setBanks] = useState<BankRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [bankName, setBankName] = useState('');
  const [accName, setAccName] = useState('');
  const [accNum, setAccNum] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useAdminToast();
  const { showConfirm, confirmNode } = useConfirm();

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = async () => {
      const list = await store.listBanks();
      if (!alive) return;
      setBanks(list);
      setLoading(false);
    };
    load();
    const off = store.onBanksChange((rows) => {
      if (!alive) return;
      setBanks(rows);
      setLoading(false);
    });
    return () => {
      alive = false;
      off();
    };
  }, [active, store]);

  const resetForm = () => {
    setBankName('');
    setAccName('');
    setAccNum('');
    setEditingId(null);
  };

  const startEdit = (b: BankRecord) => {
    setEditingId(b.id);
    setBankName(b.bankName || '');
    setAccName(b.accountName || '');
    setAccNum(b.accountNumber || '');
    // Scroll the form into view so the admin sees the pre-filled
    // fields, otherwise the list can hide them on a long page.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async () => {
    if (busy) return;
    if (!bankName.trim()) return toast('Please enter the bank name', 'error');
    if (!accName.trim()) return toast('Please enter the account holder name', 'error');
    if (!accNum.trim()) return toast('Please enter the account number', 'error');
    setBusy(true);
    try {
      if (editingId) {
        await store.updateBank(editingId, {
          bankName: bankName.trim(),
          accountName: accName.trim(),
          accountNumber: accNum.trim(),
        });
        toast('Bank updated', 'success');
      } else {
        await store.addBank({
          bankName: bankName.trim(),
          accountName: accName.trim(),
          accountNumber: accNum.trim(),
        });
        toast('Bank added', 'success');
      }
      resetForm();
    } catch (e) {
      toast(`Error: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (b: BankRecord) => {
    const ok = await showConfirm({
      title: 'Delete Bank',
      heading: 'Remove this bank?',
      message: 'Users will no longer see this bank as a deposit option.',
      confirmText: 'Remove',
      danger: true,
    });
    if (!ok) return;
    await store.deleteBank(b.id);
    toast('Bank removed', 'success');
    if (editingId === b.id) resetForm();
  };

  const toggleEnabled = async (b: BankRecord) => {
    const next = b.enabled === false;
    try {
      await store.updateBank(b.id, { enabled: next });
      toast(next ? 'Bank enabled' : 'Bank disabled', 'success', 1500);
    } catch (e) {
      toast(`Error: ${(e as Error).message}`, 'error');
    }
  };

  return (
    <>
      <div className="admin-page-header">
        <h1>
          <i className="fa-solid fa-building-columns" /> Recharge Bank Accounts
        </h1>
        <p>
          Add the bank account users will see on the recharge page. The CBE gateway subscribes
          to this list and displays the matching record.
        </p>
      </div>
      <div className="admin-page-content">
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>
              <i className={editingId ? 'fa-solid fa-pen' : 'fa-solid fa-plus'} />{' '}
              {editingId ? 'Edit Bank' : 'Add Recharge Bank'}
            </h3>
            {editingId && (
              <button
                className="admin-btn btn-secondary admin-btn-sm"
                onClick={resetForm}
                type="button"
                disabled={busy}
              >
                <i className="fa-solid fa-xmark" /> Cancel edit
              </button>
            )}
          </div>
          <div className="admin-card-body">
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="ad-label">
                  Bank Name <span className="ad-req">*</span>
                </label>
                <input
                  className="admin-form-input"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="CBE"
                />
                <small style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 4, display: 'block' }}>
                  {BANK_NAME_HINT}
                </small>
              </div>
              <div className="admin-form-group">
                <label className="ad-label">
                  Account Holder Name <span className="ad-req">*</span>
                </label>
                <input
                  className="admin-form-input"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="e.g. Alpha Trading PLC"
                />
              </div>
            </div>
            <div className="admin-form-row admin-form-row full">
              <div className="admin-form-group">
                <label className="ad-label">
                  Account Number <span className="ad-req">*</span>
                </label>
                <input
                  className="admin-form-input"
                  value={accNum}
                  onChange={(e) => setAccNum(e.target.value)}
                  placeholder="e.g. 1000100010001"
                  style={{ fontFamily: "'Courier New', monospace", letterSpacing: '1px' }}
                />
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="admin-btn btn-success" onClick={submit} disabled={busy}>
                {busy ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin" /> Saving…
                  </>
                ) : editingId ? (
                  <>
                    <i className="fa-solid fa-floppy-disk" /> Save Changes
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-plus" /> Add Bank
                  </>
                )}
              </button>
              {editingId && (
                <button
                  className="admin-btn btn-secondary"
                  onClick={resetForm}
                  disabled={busy}
                  type="button"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <h3>
              <i className="fa-solid fa-list" /> Bank List ({banks.length})
            </h3>
          </div>
          <div className="admin-card-body">
            {loading ? (
              <div className="admin-loading">
                <i className="fa-solid fa-spinner fa-spin" />
                <p>Loading banks...</p>
              </div>
            ) : banks.length === 0 ? (
              <div className="admin-empty">
                <i className="fa-solid fa-building-columns" />
                <h4>No banks yet</h4>
                <p>Add your first recharge bank account above.</p>
              </div>
            ) : (
              banks.map((b) => {
                const isEnabled = b.enabled !== false;
                const isEditing = editingId === b.id;
                return (
                  <div className="admin-list-card" key={b.id}>
                    <div className="ad-left">
                      <span className="ad-ttl">
                        <i className="fa-solid fa-building-columns admin-text-info" /> {b.bankName}
                      </span>
                      <span className="ad-sub">
                        Holder: {b.accountName || '—'}
                        {' · '}
                        {isEnabled ? (
                          <span style={{ color: '#15803d', fontWeight: 700 }}>Active</span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontWeight: 700 }}>Disabled</span>
                        )}
                      </span>
                    </div>
                    <div className="ad-right">
                      <div
                        className="ad-ttl"
                        style={{ fontFamily: "'Courier New', monospace", letterSpacing: '1px' }}
                      >
                        {b.accountNumber}
                      </div>
                      <div className="ad-sub">Account #</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                      <button
                        className="admin-btn-icon"
                        title={isEnabled ? 'Disable bank (hides from users)' : 'Enable bank'}
                        onClick={() => toggleEnabled(b)}
                        style={{
                          color: isEnabled ? '#15803d' : '#94a3b8',
                        }}
                      >
                        <i className={`fa-solid ${isEnabled ? 'fa-toggle-on' : 'fa-toggle-off'}`} />
                      </button>
                      <button
                        className="admin-btn-icon"
                        title="Edit"
                        onClick={() => startEdit(b)}
                        style={{ color: isEditing ? '#1d4ed8' : undefined }}
                      >
                        <i className="fa-solid fa-pen" />
                      </button>
                      <button
                        className="admin-btn-icon danger"
                        title="Delete"
                        onClick={() => remove(b)}
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
