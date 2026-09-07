// ----------------------------------------------------------------------
// DemoDataStore — localStorage + window event bus.
//
// Used when Firebase isn't configured. Lets you explore the panel
// without provisioning a Firebase project.
// ----------------------------------------------------------------------

import type {
  AdminPlan,
  AppConfig,
  BankRecord,
  DepositRecord,
  GiftCodeRecord,
  TelegramLinks,
  TxnStatus,
  UserRecord,
  WithdrawalRecord,
} from '../types/admin';
import {
  DEFAULT_APP_CONFIG,
  DEFAULT_TELEGRAM_LINKS,
} from '../types/admin';
import type { DataStoreAPI, Unsubscribe } from './dataStore';

const LS_PREFIX = 'alpha-admin::ds::';
const LS_KEYS = {
  users: LS_PREFIX + 'users',
  deposits: LS_PREFIX + 'deposits',
  withdrawals: LS_PREFIX + 'withdrawals',
  plans: LS_PREFIX + 'plans',
  banks: LS_PREFIX + 'banks',
  giftCodes: LS_PREFIX + 'giftCodes',
  config: LS_PREFIX + 'config',
  telegram: LS_PREFIX + 'telegram',
  giftRedeemLog: LS_PREFIX + 'giftRedeemLog',
} as const;

const EVENT_NAME = 'alpha-admin::ds::change';

type ChangeKey = keyof typeof LS_KEYS;
type Listener = (payload: unknown) => void;

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLS<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / private-mode errors
  }
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface EventBus {
  on(key: ChangeKey, cb: Listener): Unsubscribe;
  emit(key: ChangeKey, payload: unknown): void;
}

function makeBus(): EventBus {
  const listeners = new Map<ChangeKey, Set<Listener>>();

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e: StorageEvent) => {
      if (!e.key || !e.newValue) return;
      if (!e.key.startsWith(LS_PREFIX)) return;
      const k = e.key.slice(LS_PREFIX.length) as ChangeKey;
      if (!LS_KEYS[k]) return;
      try {
        const parsed = JSON.parse(e.newValue);
        listeners.get(k)?.forEach((cb) => cb(parsed));
      } catch {
        // ignore
      }
    });
  }

  return {
    on(key, cb) {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(cb);
      return () => set!.delete(cb);
    },
    emit(key, payload) {
      listeners.get(key)?.forEach((cb) => cb(payload));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { key, payload } }));
      }
    },
  };
}

export class DemoDataStore implements DataStoreAPI {
  readonly mode = 'demo' as const;
  private bus = makeBus();
  private giftRedeemLog: Record<string, string> = readLS(LS_KEYS.giftRedeemLog, {});

  // ---------- users ----------
  async listUsers(): Promise<UserRecord[]> {
    const users = readLS<Record<string, UserRecord>>(LS_KEYS.users, {});
    return Object.entries(users).map(([k, v]) => ({ ...v, uid: k }));
  }
  async getUser(uid: string): Promise<UserRecord | null> {
    const users = readLS<Record<string, UserRecord>>(LS_KEYS.users, {});
    return users[uid] ? { ...users[uid], uid } : null;
  }
  async upsertUser(uid: string, patch: Partial<UserRecord>): Promise<void> {
    const users = readLS<Record<string, UserRecord>>(LS_KEYS.users, {});
    const existing = users[uid] || { uid, balance: 0, income: 0, commission: 0 };
    const merged: UserRecord = { ...existing, ...patch, uid };
    users[uid] = merged;
    writeLS(LS_KEYS.users, users);
    this.bus.emit('users', await this.listUsers());
  }
  async deleteUser(uid: string): Promise<void> {
    const users = readLS<Record<string, UserRecord>>(LS_KEYS.users, {});
    delete users[uid];
    writeLS(LS_KEYS.users, users);
    this.bus.emit('users', await this.listUsers());
  }
  async setUserBanned(uid: string, banned: boolean): Promise<void> {
    return this.upsertUser(uid, { banned });
  }
  async adjustUserBalance(uid: string, delta: number): Promise<number> {
    const u = await this.getUser(uid);
    if (!u) throw new Error('User not found');
    const newBal = (Number(u.balance) || 0) + delta;
    await this.upsertUser(uid, { balance: newBal });
    return newBal;
  }
  // NOTE: demo-mode balance updates are inherently single-tab; the
  // Firebase implementation above is the one that needs the
  // runTransaction guard, so the demo path stays a simple upsert.

  // -----------------------------------------------------------------
  // Referral chain + commission distribution (demo-mode mirror).
  // -----------------------------------------------------------------
  async findUserByInviteCode(code: string): Promise<{ uid: string; profile: UserRecord } | null> {
    if (!code) return null;
    const target = code.trim().toUpperCase();
    if (!target) return null;
    const users = readLS<Record<string, UserRecord>>(LS_KEYS.users, {});
    for (const [uid, profile] of Object.entries(users)) {
      if (!profile || typeof profile !== 'object') continue;
      const codeOnProfile =
        (typeof (profile as UserRecord & { inviteCode?: unknown }).inviteCode === 'string'
          ? ((profile as UserRecord & { inviteCode?: string }).inviteCode as string)
          : '') ||
        (typeof profile.refCode === 'string' ? profile.refCode : '');
      if (codeOnProfile && codeOnProfile.trim().toUpperCase() === target) {
        return { uid, profile };
      }
    }
    return null;
  }

  async getReferralChain(uid: string): Promise<{
    level1: string | null;
    level2: string | null;
    level3: string | null;
  }> {
    const u = await this.getUser(uid);
    if (!u) return { level1: null, level2: null, level3: null };
    const u2 = u as UserRecord & { referrer?: string; referredBy?: string };
    const l1Code =
      (typeof u2.referrer === 'string' && u2.referrer) ||
      (typeof u2.referredBy === 'string' && u2.referredBy) ||
      '';
    if (!l1Code) return { level1: null, level2: null, level3: null };
    const l1 = await this.findUserByInviteCode(l1Code);
    if (!l1) return { level1: null, level2: null, level3: null };

    const l1Profile = l1.profile as UserRecord & { referrer?: string; referredBy?: string };
    const l2Code =
      (typeof l1Profile.referrer === 'string' && l1Profile.referrer) ||
      (typeof l1Profile.referredBy === 'string' && l1Profile.referredBy) ||
      '';
    if (!l2Code) return { level1: l1.uid, level2: null, level3: null };
    const l2 = await this.findUserByInviteCode(l2Code);
    if (!l2) return { level1: l1.uid, level2: null, level3: null };

    const l2Profile = l2.profile as UserRecord & { referrer?: string; referredBy?: string };
    const l3Code =
      (typeof l2Profile.referrer === 'string' && l2Profile.referrer) ||
      (typeof l2Profile.referredBy === 'string' && l2Profile.referredBy) ||
      '';
    if (!l3Code) return { level1: l1.uid, level2: l2.uid, level3: null };
    const l3 = await this.findUserByInviteCode(l3Code);
    return { level1: l1.uid, level2: l2.uid, level3: l3?.uid ?? null };
  }

  async creditReferralCommission(
    referrerUid: string,
    amount: number,
    level: 1 | 2 | 3,
    depositAmount: number,
    sourceUserPhone: string,
  ): Promise<void> {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const u = await this.getUser(referrerUid);
    if (!u) return;
    const existingTx = Array.isArray(
      (u as UserRecord & { transactions?: unknown[] }).transactions,
    )
      ? ((u as UserRecord & { transactions: unknown[] }).transactions as unknown[])
      : [];
    const txId =
      'tx_' +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 6);
    const newTx = {
      id: txId,
      type: 'bonus',
      amount,
      description: `Level ${level} referral commission — ETB ${depositAmount.toFixed(
        2,
      )} deposit by ${sourceUserPhone || 'a new member'}`,
      at: Date.now(),
      status: 'approved',
    };
    const nextBalance = (Number(u.balance) || 0) + amount;
    const nextCommission = (Number(u.commission) || 0) + amount;
    const mergedTx = [newTx, ...existingTx].slice(0, 200);
    await this.upsertUser(referrerUid, {
      balance: nextBalance,
      commission: nextCommission,
      transactions: mergedTx as UserRecord['transactions'],
    });
  }

  async distributeReferralCommission(
    sourceUid: string,
    sourcePhone: string,
    depositAmount: number,
  ): Promise<Array<{ level: 1 | 2 | 3; uid: string; amount: number }>> {
    if (!Number.isFinite(depositAmount) || depositAmount <= 0) return [];
    // Pull the live commission rates from the admin-published config
    // (mirrors the firebase data store) so changing a rate in
    // Settings → Referral Commission takes effect on the very next
    // approved deposit in demo mode too.
    const cfg = await this.getConfig();
    const RATE_L1 = (Number(cfg.referralLevel1) || 0) / 100;
    const RATE_L2 = (Number(cfg.referralLevel2) || 0) / 100;
    const RATE_L3 = (Number(cfg.referralLevel3) || 0) / 100;
    const chain = await this.getReferralChain(sourceUid);
    const payouts: Array<{ level: 1 | 2 | 3; uid: string; amount: number }> = [];
    const entries: Array<{ level: 1 | 2 | 3; uid: string | null; rate: number }> = [
      { level: 1, uid: chain.level1, rate: RATE_L1 },
      { level: 2, uid: chain.level2, rate: RATE_L2 },
      { level: 3, uid: chain.level3, rate: RATE_L3 },
    ];
    for (const e of entries) {
      if (!e.uid) continue;
      const amount = +(depositAmount * e.rate).toFixed(2);
      if (amount <= 0) continue;
      try {
        await this.creditReferralCommission(
          e.uid,
          amount,
          e.level,
          depositAmount,
          sourcePhone,
        );
        payouts.push({ level: e.level, uid: e.uid, amount });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[referral] level ${e.level} credit failed`, err);
      }
    }
    return payouts;
  }

  onUsersChange(cb: (u: UserRecord[]) => void): Unsubscribe {
    return this.bus.on('users', (rows) => cb(rows as UserRecord[]));
  }

  // ---------- deposits ----------
  async listDeposits(): Promise<DepositRecord[]> {
    const all = readLS<Record<string, DepositRecord>>(LS_KEYS.deposits, {});
    return Object.entries(all)
      .map(([k, v]) => ({ ...v, id: k }))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }
  async createDeposit(input: Omit<DepositRecord, 'id'>): Promise<string> {
    const all = readLS<Record<string, DepositRecord>>(LS_KEYS.deposits, {});
    const id = uid('dep');
    all[id] = { ...input, id };
    writeLS(LS_KEYS.deposits, all);
    this.bus.emit('deposits', await this.listDeposits());
    return id;
  }
  async updateDepositStatus(id: string, status: TxnStatus): Promise<void> {
    const all = readLS<Record<string, DepositRecord>>(LS_KEYS.deposits, {});
    if (!all[id]) return;
    all[id] = { ...all[id], status };
    writeLS(LS_KEYS.deposits, all);
    this.bus.emit('deposits', await this.listDeposits());
  }
  async updateDeposit(id: string, patch: Partial<DepositRecord>): Promise<void> {
    const all = readLS<Record<string, DepositRecord>>(LS_KEYS.deposits, {});
    if (!all[id]) return;
    all[id] = { ...all[id], ...patch };
    writeLS(LS_KEYS.deposits, all);
    this.bus.emit('deposits', await this.listDeposits());
  }
  async deleteRejectedDeposits(): Promise<number> {
    const all = readLS<Record<string, DepositRecord>>(LS_KEYS.deposits, {});
    let n = 0;
    Object.keys(all).forEach((k) => {
      if (all[k].status === 'reject') {
        delete all[k];
        n++;
      }
    });
    writeLS(LS_KEYS.deposits, all);
    this.bus.emit('deposits', await this.listDeposits());
    return n;
  }
  onDepositsChange(cb: (r: DepositRecord[]) => void): Unsubscribe {
    return this.bus.on('deposits', (rows) => cb(rows as DepositRecord[]));
  }

  // ---------- withdrawals ----------
  async listWithdrawals(): Promise<WithdrawalRecord[]> {
    const all = readLS<Record<string, WithdrawalRecord>>(LS_KEYS.withdrawals, {});
    return Object.entries(all)
      .map(([k, v]) => ({ ...v, id: k }))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }
  async createWithdrawal(input: Omit<WithdrawalRecord, 'id'>): Promise<string> {
    const all = readLS<Record<string, WithdrawalRecord>>(LS_KEYS.withdrawals, {});
    const id = uid('wd');
    all[id] = { ...input, id };
    writeLS(LS_KEYS.withdrawals, all);
    this.bus.emit('withdrawals', await this.listWithdrawals());
    return id;
  }
  async updateWithdrawalStatus(id: string, status: TxnStatus): Promise<void> {
    const all = readLS<Record<string, WithdrawalRecord>>(LS_KEYS.withdrawals, {});
    if (!all[id]) return;
    all[id] = { ...all[id], status };
    writeLS(LS_KEYS.withdrawals, all);
    this.bus.emit('withdrawals', await this.listWithdrawals());
  }

  // Mirror of the firebase store's refundWithdrawal — add the gross
  // amount back to the user's balance and append a refund row to
  // their local transactions list. Demo-mode is single-tab so a
  // simple read-modify-write is sufficient.
  async refundWithdrawal(
    uid: string,
    amount: number,
    withdrawalId: string,
  ): Promise<void> {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const u = await this.getUser(uid);
    if (!u) return;
    const existingTx = Array.isArray(
      (u as UserRecord & { transactions?: unknown[] }).transactions,
    )
      ? ((u as UserRecord & { transactions: unknown[] }).transactions as unknown[])
      : [];
    const txId =
      'tx_' +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 6);
    const newTx = {
      id: txId,
      type: 'bonus' as const,
      amount,
      description: `Withdrawal refund — request ${withdrawalId} was rejected by admin`,
      at: Date.now(),
      status: 'approved' as const,
    };
    const nextBalance = (Number(u.balance) || 0) + amount;
    const mergedTx = [newTx, ...existingTx].slice(0, 200);
    await this.upsertUser(uid, {
      balance: nextBalance,
      transactions: mergedTx as UserRecord['transactions'],
    });
  }
  onWithdrawalsChange(cb: (r: WithdrawalRecord[]) => void): Unsubscribe {
    return this.bus.on('withdrawals', (rows) => cb(rows as WithdrawalRecord[]));
  }

  // ---------- plans ----------
  async listPlans(): Promise<AdminPlan[]> {
    const all = readLS<Record<string, AdminPlan>>(LS_KEYS.plans, {});
    return Object.entries(all)
      .map(([k, v]) => ({ ...v, id: k }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  async upsertPlan(plan: AdminPlan): Promise<void> {
    const all = readLS<Record<string, AdminPlan>>(LS_KEYS.plans, {});
    all[plan.id] = plan;
    writeLS(LS_KEYS.plans, all);
    this.bus.emit('plans', await this.listPlans());
  }
  async deletePlan(id: string): Promise<void> {
    const all = readLS<Record<string, AdminPlan>>(LS_KEYS.plans, {});
    delete all[id];
    writeLS(LS_KEYS.plans, all);
    this.bus.emit('plans', await this.listPlans());
  }
  onPlansChange(cb: (r: AdminPlan[]) => void): Unsubscribe {
    return this.bus.on('plans', (rows) => cb(rows as AdminPlan[]));
  }

  /**
   * Mirror of the Firebase implementation for demo mode. Same
   * validation, same balance handling, same shape of result.
   */
  async giveInvestmentPlan(input: {
    uid: string;
    planId: string;
    chargeUser: boolean;
    adminNote?: string;
  }): Promise<{ ok: true; investmentId: string } | { ok: false; reason: string }> {
    const allPlans = readLS<Record<string, AdminPlan>>(LS_KEYS.plans, {});
    const plan = allPlans[input.planId];
    if (!plan) return { ok: false, reason: 'Plan not found' };

    const allUsers = readLS<Record<string, UserRecord>>(LS_KEYS.users, {});
    const user = allUsers[input.uid];
    if (!user) return { ok: false, reason: 'User not found' };

    const price = Number(plan.price) || 0;
    const dailyIncome = Number(plan.dailyIncome) || 0;
    const duration = Number(plan.duration) || 0;
    if (price <= 0 || dailyIncome <= 0 || duration <= 0) {
      return { ok: false, reason: 'Plan is missing required fields' };
    }

    if (input.chargeUser && (Number(user.balance) || 0) < price) {
      return {
        ok: false,
        reason: `User balance ${(Number(user.balance) || 0).toFixed(2)} ETB is below the plan price ${price.toFixed(2)} ETB.`,
      };
    }

    const now = Date.now();
    const investmentId = `inv_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const totalReturn = Number(plan.totalReturn) || dailyIncome * duration;

    const newInvestment = {
      id: investmentId,
      planId: plan.id,
      planTitle: plan.title,
      amount: price,
      dailyIncome,
      totalReturn,
      duration,
      startAt: now,
      endAt: now + duration * 86_400_000,
      nextReleaseAt: now + 86_400_000,
      earned: 0,
      status: 'active' as const,
      releasedCount: 0,
      assignedByAdmin: true,
      ...(input.adminNote ? { adminNote: input.adminNote } : {}),
    };

    const transactionRow = {
      id: `tx_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type: input.chargeUser ? ('investment' as const) : ('bonus' as const),
      amount: input.chargeUser ? -price : 0,
      description: input.chargeUser
        ? `Investment in ${plan.title} (assigned by admin${input.adminNote ? ` · ${input.adminNote}` : ''})`
        : `Plan assigned by admin: ${plan.title}${input.adminNote ? ` · ${input.adminNote}` : ''}`,
      at: now,
      status: 'approved' as const,
    };

    const nextBalance = input.chargeUser ? (Number(user.balance) || 0) - price : Number(user.balance) || 0;
    const updatedUser: UserRecord = {
      ...user,
      balance: nextBalance,
      investments: [newInvestment, ...(Array.isArray(user.investments) ? user.investments : [])],
      transactions: [
        transactionRow,
        ...(Array.isArray(user.transactions) ? user.transactions : []),
      ],
    };
    allUsers[input.uid] = updatedUser;
    writeLS(LS_KEYS.users, allUsers);
    this.bus.emit('users', await this.listUsers());
    return { ok: true, investmentId };
  }

  // ---------- banks ----------
  async listBanks(): Promise<BankRecord[]> {
    const all = readLS<Record<string, BankRecord>>(LS_KEYS.banks, {});
    return Object.entries(all).map(([k, v]) => ({ ...v, id: k }));
  }
  async addBank(input: Omit<BankRecord, 'id'>): Promise<string> {
    const all = readLS<Record<string, BankRecord>>(LS_KEYS.banks, {});
    const id = uid('bank');
    all[id] = { ...input, id, enabled: true };
    writeLS(LS_KEYS.banks, all);
    this.bus.emit('banks', await this.listBanks());
    return id;
  }
  async updateBank(id: string, patch: Partial<Omit<BankRecord, 'id'>>): Promise<void> {
    const all = readLS<Record<string, BankRecord>>(LS_KEYS.banks, {});
    const cur = all[id];
    if (!cur) return;
    all[id] = { ...cur, ...patch, id };
    writeLS(LS_KEYS.banks, all);
    this.bus.emit('banks', await this.listBanks());
  }
  async deleteBank(id: string): Promise<void> {
    const all = readLS<Record<string, BankRecord>>(LS_KEYS.banks, {});
    delete all[id];
    writeLS(LS_KEYS.banks, all);
    this.bus.emit('banks', await this.listBanks());
  }
  onBanksChange(cb: (r: BankRecord[]) => void): Unsubscribe {
    return this.bus.on('banks', (rows) => cb(rows as BankRecord[]));
  }

  // ---------- gift codes ----------
  async listGiftCodes(): Promise<GiftCodeRecord[]> {
    const all = readLS<Record<string, GiftCodeRecord>>(LS_KEYS.giftCodes, {});
    return Object.entries(all)
      .map(([k, v]) => ({ ...v, key: k }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  async createGiftCode(input: {
    key: string;
    amount: number;
    maxUses: number;
    expiresAt: number | null;
  }): Promise<void> {
    const all = readLS<Record<string, GiftCodeRecord>>(LS_KEYS.giftCodes, {});
    all[input.key] = {
      key: input.key,
      amount: input.amount,
      maxUses: input.maxUses,
      status: 'active',
      createdAt: Date.now(),
      expiresAt: input.expiresAt,
      usedByList: [],
    };
    writeLS(LS_KEYS.giftCodes, all);
    this.bus.emit('giftCodes', await this.listGiftCodes());
  }
  async deleteGiftCode(code: string): Promise<void> {
    const all = readLS<Record<string, GiftCodeRecord>>(LS_KEYS.giftCodes, {});
    delete all[code];
    delete this.giftRedeemLog[code];
    writeLS(LS_KEYS.giftCodes, all);
    writeLS(LS_KEYS.giftRedeemLog, this.giftRedeemLog);
    this.bus.emit('giftCodes', await this.listGiftCodes());
  }
  async redeemGiftCode(code: string, uid: string) {
    const all = readLS<Record<string, GiftCodeRecord>>(LS_KEYS.giftCodes, {});
    const entry = all[code];
    if (!entry) return { ok: false, reason: 'Invalid code' };
    if (entry.status !== 'active') return { ok: false, reason: 'Code already used' };
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      return { ok: false, reason: 'Code expired' };
    }
    const usedList = Array.isArray(entry.usedByList) ? entry.usedByList : [];
    if (usedList.includes(uid)) {
      return { ok: false, reason: 'You already used this code' };
    }
    const max = typeof entry.maxUses === 'number' && entry.maxUses > 0 ? entry.maxUses : 1;
    if (usedList.length >= max) {
      return { ok: false, reason: 'Code already fully claimed' };
    }
    const nextList = [...usedList, uid];
    all[code] = {
      ...entry,
      status: nextList.length >= max ? 'used' : 'active',
      usedByList: nextList,
      usedBy: uid,
      usedAt: Date.now(),
    };
    writeLS(LS_KEYS.giftCodes, all);
    this.bus.emit('giftCodes', await this.listGiftCodes());
    return { ok: true, amount: entry.amount };
  }
  onGiftCodesChange(cb: (r: GiftCodeRecord[]) => void): Unsubscribe {
    return this.bus.on('giftCodes', (rows) => cb(rows as GiftCodeRecord[]));
  }

  // ---------- settings ----------
  async getConfig(): Promise<AppConfig> {
    return readLS<AppConfig>(LS_KEYS.config, DEFAULT_APP_CONFIG);
  }
  async saveConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
    const cur = await this.getConfig();
    const next: AppConfig = { ...cur, ...patch };
    writeLS(LS_KEYS.config, next);
    this.bus.emit('config', next);
    return next;
  }
  async getTelegramLinks(): Promise<TelegramLinks> {
    return readLS<TelegramLinks>(LS_KEYS.telegram, DEFAULT_TELEGRAM_LINKS);
  }
  async saveTelegramLinks(patch: Partial<TelegramLinks>): Promise<TelegramLinks> {
    const cur = await this.getTelegramLinks();
    const next: TelegramLinks = { ...cur, ...patch };
    writeLS(LS_KEYS.telegram, next);
    this.bus.emit('telegram', next);
    return next;
  }
  onConfigChange(cb: (cfg: AppConfig) => void): Unsubscribe {
    return this.bus.on('config', (v) => cb(v as AppConfig));
  }
  onTelegramChange(cb: (tg: TelegramLinks) => void): Unsubscribe {
    return this.bus.on('telegram', (v) => cb(v as TelegramLinks));
  }
}
