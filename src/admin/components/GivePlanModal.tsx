import { useEffect, useMemo, useState } from 'react';
import { getDataStore } from '../../services/dataStore';
import { useAdminToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import type { AdminPlan, UserRecord } from '../../types/admin';


interface GivePlanModalProps {
  user: UserRecord;
  onClose: () => void;
  onAssigned: () => void;
}

const fmt = (n: number | string | undefined, d = 2) => {
  const v = parseFloat(String(n ?? 0));
  return (Number.isFinite(v) ? v : 0).toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
};

export function GivePlanModal({ user, onClose, onAssigned }: GivePlanModalProps) {
  const store = getDataStore();
  const toast = useAdminToast();
  const { showConfirm, confirmNode } = useConfirm();
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [chargeUser, setChargeUser] = useState<boolean>(true);
  const [adminNote, setAdminNote] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const list = await store.listPlans();
      if (!alive) return;
      const enabled = list.filter((p) => p.enabled !== false);
      setPlans(enabled);
      setSelectedPlanId(enabled[0]?.id ?? '');
      setLoading(false);
    };
    load();
    const off = store.onPlansChange((rows) => {
      if (!alive) return;
      const enabled = rows.filter((p) => p.enabled !== false);
      setPlans(enabled);
      setSelectedPlanId((cur) => (enabled.some((p) => p.id === cur) ? cur : enabled[0]?.id ?? ''));
    });
    return () => {
      alive = false;
      off();
    };
  }, [store]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  const userBalance = Number(user.balance) || 0;
  const planPrice = Number(selectedPlan?.price) || 0;
  const balanceShort = chargeUser && selectedPlan ? userBalance < planPrice : false;
  const balanceAfter = chargeUser && selectedPlan ? userBalance - planPrice : userBalance;

  const submit = async () => {
    if (busy) return;
    if (!selectedPlan) {
      toast('Please select a plan to assign.', 'error');
      return;
    }
    if (chargeUser && balanceShort) {
      toast(
        `User balance ${fmt(userBalance)} ETB is below the plan price ${fmt(planPrice)} ETB.`,
        'error',
      );
      return;
    }
    const ok = await showConfirm({
      title: 'Assign Plan',
      heading: `Assign "${selectedPlan.title}" to ${user.name || user.phone || user.uid}?`,
      message: chargeUser
        ? `This will deduct ${fmt(planPrice)} ETB from the user's balance (current ${fmt(userBalance)} ETB, after ${fmt(balanceAfter)} ETB) and start the plan now.`
        : `This will gift the plan to the user (no balance change). The user starts earning ${fmt(selectedPlan.dailyIncome)} ETB / day immediately.`,
      confirmText: chargeUser ? 'Assign & Charge' : 'Assign Free',
    });
    if (!ok) return;

    setBusy(true);
    try {
      const result = await store.giveInvestmentPlan({
        uid: user.uid,
        planId: selectedPlan.id,
        chargeUser,
        adminNote: adminNote.trim() || undefined,
      });
      if (result.ok) {
        toast(
          chargeUser
            ? `Plan assigned. ${fmt(planPrice)} ETB deducted; investment ${result.investmentId} is now active.`
            : `Plan gifted. Investment ${result.investmentId} is now active.`,
          'success',
        );
        onAssigned();
        onClose();
      } else {
        toast(result.reason || 'Failed to assign plan', 'error');
      }
    } catch (e) {
      toast(`Error: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={busy ? undefined : onClose}>
      <div
        className="admin-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-give-plan-title"
      >
        <div className="admin-modal-head">
          <h2 id="admin-give-plan-title">
            <i className="fa-solid fa-gift admin-text-info" /> Assign Plan to User
          </h2>
          <button
            className="admin-modal-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="admin-modal-body">
          <div className="admin-info-row" style={{ marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                User
              </div>
              <div style={{ fontWeight: 800, fontSize: '1rem' }}>
                {user.name || 'Unnamed'}{' '}
                <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.85rem' }}>
                  ({user.phone || user.uid})
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                Current Balance
              </div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1d4ed8' }}>
                {fmt(userBalance)} ETB
              </div>
            </div>
          </div>

          {loading ? (
            <div className="admin-loading">
              <i className="fa-solid fa-spinner fa-spin" />
              <p>Loading plans…</p>
            </div>
          ) : plans.length === 0 ? (
            <div className="admin-empty">
              <i className="fa-solid fa-box-open" />
              <h4>No published plans</h4>
              <p>Create and enable a plan in the Investment Plans section first.</p>
            </div>
          ) : (
            <>
              <div className="admin-form-group" style={{ marginBottom: 14 }}>
                <label className="ad-label">Plan</label>
                <select
                  className="admin-form-input"
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  disabled={busy}
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} — {fmt(p.price)} ETB · {fmt(p.dailyIncome)} ETB/day · {p.duration}d
                    </option>
                  ))}
                </select>
              </div>

              {selectedPlan && (
                <div
                  style={{
                    background: '#dbeafe',
                    border: '1px solid #93c5fd',
                    padding: 12,
                    marginBottom: 14,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 8,
                    fontSize: '0.85rem',
                  }}
                >
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700 }}>
                      Price
                    </div>
                    <div style={{ fontWeight: 800, color: '#1e3a8a' }}>{fmt(selectedPlan.price)} ETB</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700 }}>
                      Daily income
                    </div>
                    <div style={{ fontWeight: 800, color: '#1e3a8a' }}>{fmt(selectedPlan.dailyIncome)} ETB</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700 }}>
                      Duration
                    </div>
                    <div style={{ fontWeight: 800, color: '#1e3a8a' }}>{selectedPlan.duration} days</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700 }}>
                      Total return
                    </div>
                    <div style={{ fontWeight: 800, color: '#1e3a8a' }}>{fmt(selectedPlan.totalReturn)} ETB</div>
                  </div>
                </div>
              )}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                <button
                  type="button"
                  className={`admin-btn ${chargeUser ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setChargeUser(true)}
                  disabled={busy}
                >
                  <i className="fa-solid fa-money-bill-transfer" /> Charge user
                </button>
                <button
                  type="button"
                  className={`admin-btn ${!chargeUser ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setChargeUser(false)}
                  disabled={busy}
                >
                  <i className="fa-solid fa-gift" /> Gift (free)
                </button>
              </div>

              {chargeUser && selectedPlan && (
                <div
                  style={{
                    background: balanceShort ? '#fee2e2' : '#dcfce7',
                    border: '1px solid ' + (balanceShort ? '#fecaca' : '#bbf7d0'),
                    color: balanceShort ? '#7f1d1d' : '#14532d',
                    padding: 10,
                    fontSize: '0.82rem',
                    marginBottom: 14,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <i className={balanceShort ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check'} />
                  {balanceShort
                    ? `Insufficient balance. User needs ${fmt(planPrice - userBalance)} ETB more.`
                    : `After assignment: ${fmt(balanceAfter)} ETB remaining.`}
                </div>
              )}

              <div className="admin-form-group" style={{ marginBottom: 0 }}>
                <label className="ad-label">Note (optional)</label>
                <input
                  className="admin-form-input"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Why is this plan being assigned?"
                  disabled={busy}
                  maxLength={200}
                />
              </div>
            </>
          )}
        </div>

        <div className="admin-modal-foot">
          <button className="admin-btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="admin-btn btn-success"
            onClick={submit}
            disabled={busy || loading || !selectedPlan || (chargeUser && balanceShort)}
          >
            {busy ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" /> Assigning…
              </>
            ) : (
              <>
                <i className="fa-solid fa-paper-plane" />{' '}
                {chargeUser ? 'Assign & Charge' : 'Assign Free'}
              </>
            )}
          </button>
        </div>
        {confirmNode}
      </div>
    </div>
  );
}
