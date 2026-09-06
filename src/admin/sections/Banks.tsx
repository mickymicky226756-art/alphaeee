import { useEffect, useState } from 'react';
import { getDataStore } from '../../services/dataStore';
import type { BankRecord } from '../../types/admin';
import { useAdminToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmModal';

export function BanksSection({ active }: { active: boolean }) {
  const store = getDataStore();
  const [banks, setBanks] = useState<BankRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [bankName, setBankName] = useState('');
  const [accName, setAccName] = useState('');
  const [accNum, setAccNum] = useState('');
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

  const add = async () => {
    if (!bankName.trim()) return toast('Please enter bank name', 'error');
    if (!accName.trim()) return toast('Please enter account holder name', 'error');
    if (!accNum.trim()) return toast('Please enter account number', 'error');
    try {
      await store.addBank({
        bankName: bankName.trim(),
        accountName: accName.trim(),
        accountNumber: accNum.trim(),
      });
      toast('Bank added', 'success');
      setBankName('');
      setAccName('');
      setAccNum('');
    } catch (e) {
      toast(`Error: ${(e as Error).message}`, 'error');
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
  };

  return (
    <>
      <div className="admin-page-header">
        <h1>
          <i className="fa-solid fa-building-columns" /> Bank Accounts
        </h1>
        <p>Add or remove deposit bank accounts shown to users.</p>
      </div>
      <div className="admin-page-content">
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>
              <i className="fa-solid fa-plus" /> Add Deposit Bank
            </h3>
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
                  placeholder="e.g. bKash / Nagad / Bank Asia"
                />
              </div>
              <div className="admin-form-group">
                <label className="ad-label">
                  Account Holder <span className="ad-req">*</span>
                </label>
                <input
                  className="admin-form-input"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="e.g. Alpha Trading"
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
                  placeholder="017XXXXXXXX"
                />
              </div>
            </div>
            <button className="admin-btn btn-success" onClick={add}>
              <i className="fa-solid fa-plus" /> Add Bank
            </button>
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
                <p>Add your first deposit bank account above.</p>
              </div>
            ) : (
              banks.map((b) => (
                <div className="admin-list-card" key={b.id}>
                  <div className="ad-left">
                    <span className="ad-ttl">
                      <i className="fa-solid fa-building-columns admin-text-info" /> {b.bankName}
                    </span>
                    <span className="ad-sub">{b.accountName || '—'}</span>
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
                  <button
                    className="admin-btn-icon danger"
                    title="Delete"
                    onClick={() => remove(b)}
                  >
                    <i className="fa-solid fa-trash" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      {confirmNode}
    </>
  );
}
