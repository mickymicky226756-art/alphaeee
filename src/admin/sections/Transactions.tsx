import { useEffect, useMemo, useState } from 'react';
import { getDataStore } from '../../services/dataStore';
import type { DepositRecord, WithdrawalRecord } from '../../types/admin';
import { useConfirm } from '../components/ConfirmModal';
import { useAdminToast } from '../components/Toast';

const fmt = (n: number | string | undefined, d = 2) => {
  const v = parseFloat(String(n ?? 0));
  return (Number.isFinite(v) ? v : 0).toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
};
const fmtDateTime = (ts?: number) => {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
};

type Filter = 'pending' | 'deposits' | 'withdrawals' | 'rejected';

interface TransactionsSectionProps {
  active: boolean;
  // `withdrawalsOnly` is the sub-admin mode. When true, the section
  // hides every deposit-related UI (deposit filter pill, pending
  // deposits card, approved deposits history, rejected deposits)
  // and shows only withdrawal-related content. The default filter
  // also lands on `pending` so the sub-admin sees their queue
  // first.
  withdrawalsOnly?: boolean;
  defaultFilter?: Filter;
}

export function TransactionsSection({
  active,
  withdrawalsOnly = false,
  defaultFilter = 'pending',
}: TransactionsSectionProps) {
  const store = useMemo(() => getDataStore(), []);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // Belt-and-braces: the default filter is `pending`, but in
  // withdrawals-only mode we silently coerce any other value to
  // `pending` to keep the sub-admin in the queue.
  const [filter, setFilter] = useState<Filter>(
    withdrawalsOnly ? 'pending' : defaultFilter,
  );
  const toast = useAdminToast();
  const { showConfirm, confirmNode } = useConfirm();

  // If the prop ever changes after mount, keep the filter
  // in sync. In practice the role is fixed at login, so this is a
  // safety net rather than something the user will see flip.
  useEffect(() => {
    if (withdrawalsOnly) setFilter('pending');
  }, [withdrawalsOnly]);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = async () => {
      const [d, w] = await Promise.all([store.listDeposits(), store.listWithdrawals()]);
      if (!alive) return;
      setDeposits(d);
      setWithdrawals(w);
      setLoading(false);
    };
    load();
    const u1 = store.onDepositsChange((rows) => {
      if (!alive) return;
      setDeposits(rows);
      setLoading(false);
    });
    const u2 = store.onWithdrawalsChange((rows) => {
      if (!alive) return;
      setWithdrawals(rows);
      setLoading(false);
    });
    return () => {
      alive = false;
      u1();
      u2();
    };
  }, [active, store]);

  const pendingDeps = useMemo(() => deposits.filter((d) => d.status === 'pending'), [deposits]);
  const pendingWds = useMemo(
    () => withdrawals.filter((w) => w.status === 'pending'),
    [withdrawals],
  );
  const approvedDeps = useMemo(() => deposits.filter((d) => d.status === 'approve'), [deposits]);
  const approvedWds = useMemo(
    () => withdrawals.filter((w) => w.status === 'approve'),
    [withdrawals],
  );
  const rejected = useMemo(() => {
    const out: Array<DepositRecord | (WithdrawalRecord & { _type: 'Withdraw' })> = [];
    // Sub-admin never sees rejected deposits.
    if (!withdrawalsOnly) {
      deposits.filter((d) => d.status === 'reject').forEach((d) => out.push(d));
    }
    withdrawals
      .filter((w) => w.status === 'reject')
      .forEach((w) => out.push({ ...w, _type: 'Withdraw' }));
    return out.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [deposits, withdrawals, withdrawalsOnly]);

  // Re-entry guard: a slow double-click on Approve / Reject used to
  // call adjustUserBalance twice. We track in-flight ids so the
  // second invocation short-circuits.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const markBusy = (id: string) =>
    setBusyIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  const clearBusy = (id: string) =>
    setBusyIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const handleApprove = async (
    type: 'deposits' | 'withdrawals',
    reqId: string,
    uid: string,
    amt: number,
    isWithdraw = false,
  ) => {
    // Sub-admins must never approve deposits. The UI already hides
    // deposit cards, but guard here too so a stale race (e.g. a
    // pending deposit arrives just as the role changes) cannot
    // slip through.
    if (withdrawalsOnly && !isWithdraw) {
      toast('Withdrawals-only role: deposits are not allowed.', 'error');
      return;
    }
    if (busyIds.has(reqId)) return;
    const ok = await showConfirm({
      title: 'Approve Transaction',
      heading: `Approve this ${type === 'deposits' ? 'deposit' : 'withdrawal'}?`,
      message: `Amount: ${fmt(amt)} BDT${
        isWithdraw
          ? ' (User balance was already deducted on submit; admin approval just confirms the payout)'
          : ' (Will be added to user balance)'
      }`,
      confirmText: 'Approve',
    });
    if (!ok) return;

    // Re-check inside the busy guard so two confirms in rapid
    // succession (modal dismissed + re-opened, or programmatic click)
    // can't both slip through.
    if (busyIds.has(reqId)) return;
    markBusy(reqId);
    let referralSummary: string | null = null;
    try {
      if (!isWithdraw) {
        // Approve a deposit → credit the user's balance.
        await store.adjustUserBalance(uid, amt);
        const u = await store.getUser(uid);
        if (u && !u.firstDepositDone) {
          await store.upsertUser(uid, { firstDepositDone: true });
        }
        // Distribute the 3-level referral commission (20% / 2% / 1%).
        // If the chain is short (e.g. the depositor was referred but
        // their referrer has no own referrer) only the present levels
        // are credited. We capture the summary for the success toast.
        const payouts = await store.distributeReferralCommission(
          uid,
          u?.phone || '',
          amt,
        );
        if (payouts.length > 0) {
          referralSummary = payouts
            .map((p) => `L${p.level} ${p.amount.toFixed(2)}`)
            .join(', ');
        }
      } else {
        // Approve a withdrawal → the user side already deducted the
        // gross amount when the request was submitted, so all the
        // admin does here is mark the record `approve`. No further
        // balance change is needed (and doing one would double-deduct
        // the user, which is the exact bug this round is fixing).
      }
      if (isWithdraw) {
        await store.updateWithdrawalStatus(reqId, 'approve');
      } else {
        await store.updateDepositStatus(reqId, 'approve');
      }
      toast(
        referralSummary
          ? `Transaction approved · Referral paid: ${referralSummary}`
          : 'Transaction approved',
        'success',
      );
    } catch (e) {
      toast(`Error: ${(e as Error).message}`, 'error');
    } finally {
      clearBusy(reqId);
    }
  };

  const handleReject = async (
    type: 'deposits' | 'withdrawals',
    reqId: string,
    uid: string | null,
    amt: number,
  ) => {
    // Sub-admins must never reject deposits either, for the same
    // reason as `handleApprove` above.
    if (withdrawalsOnly && type === 'deposits') {
      toast('Withdrawals-only role: deposits are not allowed.', 'error');
      return;
    }
    if (busyIds.has(reqId)) return;
    const isWithdraw = type === 'withdrawals';
    const ok = await showConfirm({
      title: 'Reject Transaction',
      heading: `Reject this ${type === 'deposits' ? 'deposit' : 'withdrawal'}?`,
      message: isWithdraw
        ? `The withdrawal request will be marked rejected and the full BDT ${fmt(
            amt,
          )} will be REFUNDED to the user's balance.`
        : 'This will mark the deposit as rejected.',
      confirmText: 'Reject & Refund',
      danger: true,
    });
    if (!ok) return;
    if (busyIds.has(reqId)) return;
    markBusy(reqId);
    try {
      if (isWithdraw) {
        // The user side deducts the gross amount when the request is
        // submitted. A rejection has to put that money back, so we
        // call `refundWithdrawal` which credits the user's balance
        // and writes a refund entry into their transaction log in a
        // single atomic runTransaction. Only then do we mark the
        // withdrawal record rejected — that order matters: if the
        // refund write failed we'd rather leave the request pending
        // and have the admin retry than have a rejected record with
        // missing money.
        if (uid) {
          await store.refundWithdrawal(uid, amt, reqId);
        }
        await store.updateWithdrawalStatus(reqId, 'reject');
      } else {
        // Deposits never credited yet, so no balance change needed.
        await store.updateDepositStatus(reqId, 'reject');
      }
      toast(
        isWithdraw
          ? `Transaction rejected · BDT ${fmt(amt)} refunded to user`
          : 'Transaction rejected',
        'success',
      );
    } catch (e) {
      toast(`Error: ${(e as Error).message}`, 'error');
    } finally {
      clearBusy(reqId);
    }
  };

  const handleClearRejected = async () => {
    // The function purges rejected *deposits* only. Sub-admins
    // don't see deposits, so the function has nothing to do for
    // them — refuse early so the button can't be smuggled in.
    if (withdrawalsOnly) return;
    const ok = await showConfirm({
      title: 'Clear Rejected',
      heading: 'Clear ALL rejected transactions?',
      message: 'This action is irreversible. All rejected transactions will be permanently removed.',
      confirmText: 'Clear All',
      danger: true,
    });
    if (!ok) return;
    const n = await store.deleteRejectedDeposits();
    toast(`Cleared ${n} rejected transactions`, 'success');
  };

  return (
    <>
      <div className="admin-page-header">
        <h1>
          <i className="fa-solid fa-money-bill-transfer" />{' '}
          {withdrawalsOnly ? 'Withdrawals' : 'Transactions'}
        </h1>
        <p>
          {withdrawalsOnly
            ? 'Review and process withdrawal requests.'
            : 'Review and manage deposit / withdrawal requests.'}
        </p>
      </div>
      <div className="admin-page-content">
        <div className="admin-filter-pills admin-mb-2">
          {/* In withdrawalsOnly mode the `deposits` pill is hidden —
              a sub-admin must never see the deposit queue. */}
          {(
            withdrawalsOnly
              ? (['pending', 'withdrawals', 'rejected'] as const)
              : (['pending', 'deposits', 'withdrawals', 'rejected'] as const)
          ).map((f) => (
            <button
              key={f}
              className={`admin-filter-pill ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f as Filter)}
            >
              {f === 'pending' && (
                <>
                  <i className="fa-solid fa-hourglass-half" /> Pending
                  {(pendingDeps.length + pendingWds.length > 0) && (
                    <span className="admin-badge warning" style={{ marginLeft: 4 }}>
                      {pendingDeps.length + pendingWds.length}
                    </span>
                  )}
                </>
              )}
              {f === 'deposits' && (
                <>
                  <i className="fa-solid fa-circle-check" /> Approved Deposits
                </>
              )}
              {f === 'withdrawals' && (
                <>
                  <i className="fa-solid fa-circle-check" /> Approved Withdrawals
                </>
              )}
              {f === 'rejected' && (
                <>
                  <i className="fa-solid fa-circle-xmark" /> Rejected
                </>
              )}
            </button>
          ))}
        </div>

        {filter === 'pending' && (
          <>
            {/* Pending Deposit Requests — hidden entirely for the
                withdrawals-only sub-admin. */}
            {!withdrawalsOnly && (
              <div className="admin-card">
                <div className="admin-card-header">
                  <h3>
                    <i className="fa-solid fa-hourglass-half admin-text-warning" /> Pending Deposit
                    Requests
                  </h3>
                  <button
                    className="admin-btn btn-sm btn-secondary"
                    onClick={async () => {
                      setLoading(true);
                      const [d, w] = await Promise.all([
                        store.listDeposits(),
                        store.listWithdrawals(),
                      ]);
                      setDeposits(d);
                      setWithdrawals(w);
                      setLoading(false);
                      toast('Refreshed', 'success', 1200);
                    }}
                  >
                    <i className="fa-solid fa-arrows-rotate" /> Refresh
                  </button>
                </div>
                <div className="admin-card-body">
                  {loading ? (
                    <div className="admin-loading">
                      <i className="fa-solid fa-spinner fa-spin" />
                      <p>Loading...</p>
                    </div>
                  ) : pendingDeps.length === 0 ? (
                    <div className="admin-empty">
                      <i className="fa-solid fa-inbox" />
                      <h4>No pending deposits</h4>
                      <p>All caught up!</p>
                    </div>
                  ) : (
                    pendingDeps.map((r) => (
                      <DepositRequestCard
                        key={r.id}
                        r={r}
                        busy={busyIds.has(r.id)}
                        onApprove={() => handleApprove('deposits', r.id, r.user, parseFloat(String(r.amount)))}
                        onReject={() => handleReject('deposits', r.id, null, parseFloat(String(r.amount)))}
                      />
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="admin-card">
              <div className="admin-card-header">
                <h3>
                  <i className="fa-solid fa-hourglass-half admin-text-info" /> Pending Withdrawal
                  Requests
                </h3>
                {withdrawalsOnly && (
                  <button
                    className="admin-btn btn-sm btn-secondary"
                    onClick={async () => {
                      setLoading(true);
                      const [, w] = await Promise.all([
                        store.listDeposits(),
                        store.listWithdrawals(),
                      ]);
                      setWithdrawals(w);
                      setLoading(false);
                      toast('Refreshed', 'success', 1200);
                    }}
                  >
                    <i className="fa-solid fa-arrows-rotate" /> Refresh
                  </button>
                )}
              </div>
              <div className="admin-card-body">
                {loading ? (
                  <div className="admin-loading">
                    <i className="fa-solid fa-spinner fa-spin" />
                    <p>Loading...</p>
                  </div>
                ) : pendingWds.length === 0 ? (
                  <div className="admin-empty">
                    <i className="fa-solid fa-inbox" />
                    <h4>No pending withdrawals</h4>
                    <p>All caught up!</p>
                  </div>
                ) : (
                  pendingWds.map((r) => (
                    <WithdrawalRequestCard
                      key={r.id}
                      r={r}
                      busy={busyIds.has(r.id)}
                      onApprove={() =>
                        handleApprove(
                          'withdrawals',
                          r.id,
                          r.user,
                          parseFloat(String(r.amount)),
                          true,
                        )
                      }
                      onReject={() =>
                        handleReject(
                          'withdrawals',
                          r.id,
                          r.user,
                          parseFloat(String(r.amount)),
                        )
                      }
                    />
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {filter === 'deposits' && !withdrawalsOnly && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h3>
                <i className="fa-solid fa-circle-check admin-text-success" /> Approved Deposits History
              </h3>
            </div>
            <div className="admin-card-body">
              {approvedDeps.length === 0 ? (
                <div className="admin-empty">
                  <i className="fa-solid fa-inbox" />
                  <h4>No approved deposits</h4>
                  <p>Approved deposits will appear here.</p>
                </div>
              ) : (
                approvedDeps.map((r) => (
                  <div className="admin-list-card" key={r.id}>
                    <div className="ad-left">
                      <span className="ad-ttl">
                        <span className="admin-badge success">
                          <i className="fa-solid fa-check" /> Approved
                        </span>
                      </span>
                      <span className="ad-sub">
                        User: <b>{r.user}</b> · Ref: {r.transId || '—'}
                      </span>
                      <span className="ad-sub">{fmtDateTime(r.timestamp)}</span>
                    </div>
                    <div className="ad-right">
                      <div className="ad-ttl admin-text-success">+ {fmt(r.amount)} BDT</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {filter === 'withdrawals' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h3>
                <i className="fa-solid fa-circle-check admin-text-info" /> Approved Withdrawals
                History
              </h3>
            </div>
            <div className="admin-card-body">
              {approvedWds.length === 0 ? (
                <div className="admin-empty">
                  <i className="fa-solid fa-inbox" />
                  <h4>No approved withdrawals</h4>
                  <p>Approved withdrawals will appear here.</p>
                </div>
              ) : (
                approvedWds.map((r) => (
                  <div className="admin-list-card" key={r.id}>
                    <div className="ad-left">
                      <span className="ad-ttl">
                        <span className="admin-badge info">
                          <i className="fa-solid fa-check" /> Approved
                        </span>
                      </span>
                      <span className="ad-sub">
                        User: <b>{r.user}</b>
                      </span>
                      <span className="ad-sub">
                        {r.bankName || '—'} {r.accNum || ''}
                      </span>
                      <span className="ad-sub">{fmtDateTime(r.timestamp)}</span>
                    </div>
                    <div className="ad-right">
                      <div className="ad-ttl admin-text-info">- {fmt(r.amount)} BDT</div>
                      <div className="ad-sub">Net: {fmt(r.netAmount || 0)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {filter === 'rejected' && (
          <div className="admin-card">
            <div className="admin-card-header">
              <h3>
                <i className="fa-solid fa-circle-xmark admin-text-danger" />{' '}
                {withdrawalsOnly ? 'Rejected Withdrawals' : 'Rejected Transactions'}
              </h3>
              {rejected.length > 0 && !withdrawalsOnly && (
                <button className="admin-btn btn-sm btn-danger" onClick={handleClearRejected}>
                  <i className="fa-solid fa-trash" /> Clear All
                </button>
              )}
            </div>
            <div className="admin-card-body">
              {rejected.length === 0 ? (
                <div className="admin-empty">
                  <i className="fa-solid fa-inbox" />
                  <h4>No rejected transactions</h4>
                  <p>Rejected transactions will appear here.</p>
                </div>
              ) : (
                rejected.map((r) => {
                  const isWd = (r as WithdrawalRecord & { _type?: string })._type === 'Withdraw';
                  return (
                    <div
                      className="admin-list-card"
                      key={r.id}
                      style={{ background: '#fef2f2', border: '1px solid #fecaca' }}
                    >
                      <div className="ad-left">
                        <span className="ad-ttl">
                          <span className="admin-badge danger">
                            {isWd ? 'Withdraw' : 'Deposit'} · Rejected
                          </span>
                        </span>
                        <span className="ad-sub">
                          User: <b>{r.user}</b>
                        </span>
                        <span className="ad-sub">{fmtDateTime(r.timestamp)}</span>
                      </div>
                      <div className="ad-right">
                        <div className="ad-ttl admin-text-danger">{fmt(r.amount)} BDT</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
      {confirmNode}
    </>
  );
}

function DepositRequestCard({
  r,
  onApprove,
  onReject,
  busy,
}: {
  r: DepositRecord;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  return (
    <div
      className="admin-list-card"
      style={{ padding: 14, flexDirection: 'column', alignItems: 'stretch', gap: 10, background: '#fffbeb', border: '1px solid #fde68a', marginBottom: 10 }}
    >
      <div className="admin-flex admin-justify-between admin-items-center">
        <span className="admin-badge warning">
          <i className="fa-solid fa-hourglass-half" /> Pending
        </span>
        <span style={{ color: '#64748b', fontSize: '0.78rem' }}>
          {r.date || fmtDateTime(r.timestamp)}
        </span>
      </div>
      <div className="admin-flex admin-justify-between admin-items-center">
        <span className="admin-fw-700" style={{ color: '#b45309', fontSize: '1.1rem' }}>
          + {fmt(r.amount)} BDT
        </span>
        <span className="admin-badge muted">{r.method?.toUpperCase()}</span>
      </div>
      <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
        <b>User:</b> {r.user}
        {r.userPhone && (
          <>
            {' '}
            <span style={{ color: '#64748b' }}>({r.userPhone})</span>
          </>
        )}
        <br />
        <b>Sender:</b> {r.senderName || '—'}
        <br />
        <b>Ref / Txn ID:</b> {r.transId || '—'}
        {r.orderId && (
          <>
            <br />
            <b>Order:</b> {r.orderId}
          </>
        )}
      </div>
      <div className="admin-flex admin-gap-2">
        <button
          className="admin-btn btn-success admin-flex-1"
          onClick={onApprove}
          disabled={busy}
        >
          {busy ? (
            <>
              <i className="fa-solid fa-spinner fa-spin" /> Processing…
            </>
          ) : (
            <>
              <i className="fa-solid fa-check" /> Approve
            </>
          )}
        </button>
        <button
          className="admin-btn btn-danger admin-flex-1"
          onClick={onReject}
          disabled={busy}
        >
          {busy ? (
            <>
              <i className="fa-solid fa-spinner fa-spin" /> Processing…
            </>
          ) : (
            <>
              <i className="fa-solid fa-xmark" /> Reject
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function WithdrawalRequestCard({
  r,
  onApprove,
  onReject,
  busy,
}: {
  r: WithdrawalRecord;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  return (
    <div
      className="admin-list-card"
      style={{ padding: 14, flexDirection: 'column', alignItems: 'stretch', gap: 10, background: '#eff6ff', border: '1px solid #bfdbfe', marginBottom: 10 }}
    >
      <div className="admin-flex admin-justify-between admin-items-center">
        <span className="admin-badge info">
          <i className="fa-solid fa-hourglass-half" /> Pending
        </span>
        <span style={{ color: '#64748b', fontSize: '0.78rem' }}>
          {r.date || fmtDateTime(r.timestamp)}
        </span>
      </div>
      <div className="admin-flex admin-justify-between admin-items-center">
        <span className="admin-fw-700" style={{ color: '#0e7490', fontSize: '1.1rem' }}>
          - {fmt(r.amount)} BDT
        </span>
        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>
          Net: <b style={{ color: '#0f172a' }}>{fmt(r.netAmount)} BDT</b>
        </span>
      </div>
      <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
        <b>User:</b> {r.user}
        <br />
        <b>Method:</b> {r.method?.toUpperCase() || '—'}
        <br />
        <b>Bank:</b> {r.bankName || '—'}
        <br />
        <b>Acc:</b> {r.accNum || '—'} ({r.accName || '—'})
      </div>
      <div className="admin-flex admin-gap-2">
        <button
          className="admin-btn btn-success admin-flex-1"
          onClick={onApprove}
          disabled={busy}
        >
          {busy ? (
            <>
              <i className="fa-solid fa-spinner fa-spin" /> Processing…
            </>
          ) : (
            <>
              <i className="fa-solid fa-check" /> Approve
            </>
          )}
        </button>
        <button
          className="admin-btn btn-danger admin-flex-1"
          onClick={onReject}
          disabled={busy}
        >
          {busy ? (
            <>
              <i className="fa-solid fa-spinner fa-spin" /> Processing…
            </>
          ) : (
            <>
              <i className="fa-solid fa-xmark" /> Reject &amp; Refund
            </>
          )}
        </button>
      </div>
    </div>
  );
}
