import { useEffect, useMemo, useState } from 'react';
import { getDataStore } from '../../services/dataStore';
import type {
  BankRecord,
  DepositRecord,
  GiftCodeRecord,
  UserRecord,
  WithdrawalRecord,
} from '../../types/admin';

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

interface Snapshot {
  users: UserRecord[];
  deposits: DepositRecord[];
  withdrawals: WithdrawalRecord[];
  banks: BankRecord[];
  codes: GiftCodeRecord[];
}

export function DashboardSection() {
  const store = useMemo(() => getDataStore(), []);
  const [snap, setSnap] = useState<Snapshot>({
    users: [],
    deposits: [],
    withdrawals: [],
    banks: [],
    codes: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const pull = async () => {
      const [users, deposits, withdrawals, banks, codes] = await Promise.all([
        store.listUsers(),
        store.listDeposits(),
        store.listWithdrawals(),
        store.listBanks(),
        store.listGiftCodes(),
      ]);
      if (!active) return;
      setSnap({ users, deposits, withdrawals, banks, codes });
      setLoading(false);
    };
    pull();
    const u1 = store.onUsersChange(pull);
    const u2 = store.onDepositsChange(pull);
    const u3 = store.onWithdrawalsChange(pull);
    const u4 = store.onBanksChange(pull);
    const u5 = store.onGiftCodesChange(pull);
    return () => {
      active = false;
      u1();
      u2();
      u3();
      u4();
      u5();
    };
  }, [store]);

  const totalUsers = snap.users.length;
  const activeGiftCodes = snap.codes.filter(
    (c) => c.status === 'active' && (!c.expiresAt || c.expiresAt > Date.now()),
  ).length;

  const pendingCount =
    snap.deposits.filter((d) => d.status === 'pending').length +
    snap.withdrawals.filter((w) => w.status === 'pending').length;

  const totalDeposits = snap.deposits
    .filter((d) => d.status === 'approve')
    .reduce((s, d) => s + (parseFloat(String(d.amount)) || 0), 0);
  const totalWithdrawals = snap.withdrawals
    .filter((w) => w.status === 'approve')
    .reduce((s, w) => s + (parseFloat(String(w.amount)) || 0), 0);
  const totalBalance = snap.users.reduce(
    (s, u) => s + (parseFloat(String(u.balance)) || 0),
    0,
  );

  const series = useMemo(() => buildLast7Days(snap.deposits, snap.withdrawals), [snap]);
  const recent = useMemo(() => buildRecent(snap), [snap]);

  return (
    <>
      <div className="admin-page-header">
        <h1>
          <i className="fa-solid fa-chart-line" /> Dashboard
        </h1>
        <p>Real-time platform metrics and quick actions.</p>
      </div>
      <div className="admin-page-content">
        <div className="admin-stats-grid">
          <StatCard icon="fa-users" label="Total Users" value={String(totalUsers)} sub="Active platform members" />
          <StatCard
            icon="fa-hourglass-half"
            label="Pending Requests"
            value={String(pendingCount)}
            sub="Awaiting review"
            tone="warn"
          />
          <StatCard
            icon="fa-arrow-down"
            label="Total Deposits"
            value={fmt(totalDeposits)}
            sub="Approved amount"
            suffix=" BDT"
            tone="info"
          />
          <StatCard
            icon="fa-arrow-up"
            label="Total Withdrawals"
            value={fmt(totalWithdrawals)}
            sub="Approved amount"
            suffix=" BDT"
            tone="danger"
          />
          <StatCard
            icon="fa-gift"
            label="Active Gift Codes"
            value={String(activeGiftCodes)}
            sub="Currently redeemable"
            tone="gold"
          />
          <StatCard
            icon="fa-wallet"
            label="Total User Balance"
            value={fmt(totalBalance)}
            sub="All user wallets combined"
            suffix=" BDT"
            tone="pink"
          />
        </div>

        <div className="admin-dashboard-grid">
          <div className="admin-card">
            <div className="admin-card-header">
              <h3>
                <i className="fa-solid fa-chart-area" /> Transaction Volume (Last 7 Days)
              </h3>
            </div>
            <div className="admin-card-body">
              <div className="admin-chart-wrap">
                <SimpleLineChart series={series} />
              </div>
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card-header">
              <h3>
                <i className="fa-solid fa-bolt" /> Recent Activity
              </h3>
            </div>
            <div className="admin-card-body">
              {loading ? (
                <div className="admin-loading">
                  <i className="fa-solid fa-spinner fa-spin" />
                  <p>Loading activity...</p>
                </div>
              ) : recent.length === 0 ? (
                <div className="admin-empty">
                  <i className="fa-solid fa-inbox" />
                  <h4>No activity yet</h4>
                  <p>Recent actions will appear here.</p>
                </div>
              ) : (
                <div className="admin-activity-list">
                  {recent.map((it, idx) => (
                    <div className="admin-activity-item" key={idx}>
                      <div className={`admin-activity-icon ${it.type}`}>
                        <i className={`fa-solid ${it.icon}`} />
                      </div>
                      <div className="admin-activity-info">
                        <div className="title">{it.title}</div>
                        <div className="meta">{it.meta}</div>
                      </div>
                      {it.amount && (
                        <div className={`admin-activity-amount ${it.type}`}>{it.amount}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <h3>
              <i className="fa-solid fa-rocket" /> Quick Actions
            </h3>
          </div>
          <div className="admin-card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <QuickAction target="users" icon="fa-user-plus" label="Manage Users" />
            <QuickAction target="transactions" icon="fa-money-bill-transfer" label="Review Requests" />
            <QuickAction target="plans" icon="fa-plus" label="Add Plan" />
            <QuickAction target="banks" icon="fa-building-columns" label="Manage Banks" />
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <h3>
              <i className="fa-solid fa-circle-info" /> Platform Info
            </h3>
          </div>
          <div className="admin-card-body">
            <div className="admin-info-grid">
              <div className="admin-info-row">
                <span className="ad-k">Backend Mode</span>
                <span className="ad-v">
                  {store.mode === 'firebase' ? 'Firebase Realtime Database' : 'Demo (localStorage)'}
                </span>
              </div>
              <div className="admin-info-row">
                <span className="ad-k">Last Refresh</span>
                <span className="ad-v">{new Date().toLocaleTimeString()}</span>
              </div>
              <div className="admin-info-row">
                <span className="ad-k">Bank Accounts</span>
                <span className="ad-v">{snap.banks.length}</span>
              </div>
              <div className="admin-info-row">
                <span className="ad-k">Total Plans</span>
                <span className="ad-v">— (managed in this section)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function QuickAction({ target, icon, label }: { target: string; icon: string; label: string }) {
  return (
    <button
      className="admin-btn btn-outline"
      onClick={() => {
        // Trigger a synthetic event the AdminShell listens to
        window.dispatchEvent(new CustomEvent('admin-go-to', { detail: target }));
      }}
    >
      <i className={`fa-solid ${icon}`} /> {label}
    </button>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  suffix,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  suffix?: string;
  tone?: 'warn' | 'info' | 'danger' | 'gold' | 'pink';
}) {
  return (
    <div className={`admin-stat-card ${tone || ''}`}>
      <div className="ad-icon">
        <i className={`fa-solid ${icon}`} />
      </div>
      <div className="ad-label">{label}</div>
      <div className="ad-value">
        {value}
        {suffix && <small> {suffix.trim()}</small>}
      </div>
      {sub && (
        <div className="ad-delta">
          <i className="fa-solid fa-arrow-up admin-text-success" /> {sub}
        </div>
      )}
    </div>
  );
}

interface DayPoint {
  label: string;
  date: string;
  dep: number;
  wd: number;
}

function buildLast7Days(deposits: DepositRecord[], withdrawals: WithdrawalRecord[]): DayPoint[] {
  const days = 7;
  const out: DayPoint[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      date: key,
      dep: 0,
      wd: 0,
    });
  }
  for (const dep of deposits) {
    if (dep.status !== 'approve' || !dep.timestamp) continue;
    const key = new Date(dep.timestamp).toISOString().slice(0, 10);
    const found = out.find((o) => o.date === key);
    if (found) found.dep += parseFloat(String(dep.amount)) || 0;
  }
  for (const wd of withdrawals) {
    if (wd.status !== 'approve' || !wd.timestamp) continue;
    const key = new Date(wd.timestamp).toISOString().slice(0, 10);
    const found = out.find((o) => o.date === key);
    if (found) found.wd += parseFloat(String(wd.amount)) || 0;
  }
  return out;
}

interface ActivityItem {
  type: 'in' | 'out' | 'user';
  icon: string;
  title: string;
  meta: string;
  amount?: string;
  ts: number;
}

function buildRecent(snap: Snapshot): ActivityItem[] {
  const items: ActivityItem[] = [];
  snap.deposits.forEach((d) => {
    items.push({
      type: 'in',
      icon: 'fa-arrow-down',
      title: `Deposit from ${d.user || 'user'}`,
      meta: d.date || fmtDateTime(d.timestamp),
      amount: `+${fmt(d.amount)} BDT`,
      ts: d.timestamp || 0,
    });
  });
  snap.withdrawals.forEach((w) => {
    items.push({
      type: 'out',
      icon: 'fa-arrow-up',
      title: `Withdrawal to ${w.bankName || w.method || 'bank'}`,
      meta: w.date || fmtDateTime(w.timestamp),
      amount: `-${fmt(w.amount)} BDT`,
      ts: w.timestamp || 0,
    });
  });
  snap.users.forEach((u) => {
    if (u.joinedAt) {
      items.push({
        type: 'user',
        icon: 'fa-user-plus',
        title: `New user: ${u.name || u.phone || u.uid}`,
        meta: fmtDateTime(u.joinedAt),
        ts: u.joinedAt,
      });
    }
  });
  items.sort((a, b) => b.ts - a.ts);
  return items.slice(0, 10);
}

function SimpleLineChart({ series }: { series: DayPoint[] }) {
  if (series.every((p) => p.dep === 0 && p.wd === 0)) {
    return (
      <div className="admin-empty">
        <i className="fa-solid fa-chart-area" />
        <h4>No data yet</h4>
        <p>Approved transactions will show up here.</p>
      </div>
    );
  }

  const W = 600;
  const H = 240;
  const padL = 48;
  const padR = 16;
  const padT = 16;
  const padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxVal = Math.max(1, ...series.map((p) => Math.max(p.dep, p.wd)));
  const yMax = Math.ceil(maxVal / 1000) * 1000 || 1000;

  const x = (i: number) => padL + (innerW * i) / Math.max(1, series.length - 1);
  const y = (v: number) => padT + innerH - (innerH * v) / yMax;

  const depPath = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.dep).toFixed(1)}`)
    .join(' ');
  const wdPath = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.wd).toFixed(1)}`)
    .join(' ');

  const depArea = `${depPath} L ${x(series.length - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const wdArea = `${wdPath} L ${x(series.length - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;

  const ticks = 4;
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) => (yMax * i) / ticks);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none">
      {tickValues.map((v, i) => (
        <g key={i}>
          <line
            x1={padL}
            x2={W - padR}
            y1={y(v)}
            y2={y(v)}
            stroke="rgba(0,0,0,0.06)"
            strokeDasharray="3 3"
          />
          <text
            x={padL - 8}
            y={y(v) + 4}
            textAnchor="end"
            fontSize="10"
            fill="#64748b"
            fontFamily="Inter, sans-serif"
          >
            {v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
          </text>
        </g>
      ))}
      {series.map((p, i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 10}
          textAnchor="middle"
          fontSize="10"
          fill="#64748b"
          fontFamily="Inter, sans-serif"
        >
          {p.label}
        </text>
      ))}
      <path d={depArea} fill="rgba(22,163,74,0.12)" />
      <path d={wdArea} fill="rgba(14,116,144,0.12)" />
      <path d={depPath} fill="none" stroke="#16a34a" strokeWidth="2.2" />
      <path d={wdPath} fill="none" stroke="#0e7490" strokeWidth="2.2" />
      {series.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.dep)} r="3.5" fill="#16a34a" />
          <circle cx={x(i)} cy={y(p.wd)} r="3.5" fill="#0e7490" />
        </g>
      ))}
      <g transform={`translate(${W - 200},${padT - 4})`}>
        <rect width="10" height="10" fill="#16a34a" rx="2" />
        <text x="14" y="9" fontSize="11" fill="#0f172a" fontFamily="Inter, sans-serif">Deposits</text>
        <rect x="78" width="10" height="10" fill="#0e7490" rx="2" />
        <text x="92" y="9" fontSize="11" fill="#0f172a" fontFamily="Inter, sans-serif">Withdrawals</text>
      </g>
    </svg>
  );
}
