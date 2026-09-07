// ----------------------------------------------------------------------
// FirebaseDataStore — Firebase Realtime Database backend for the admin
// panel. All write paths used by the admin UI go through this class.
// ----------------------------------------------------------------------

import {
  db,
  fGet,
  fOn,
  fPush,
  fSet,
  fUpdate,
  r,
  runTransaction,
} from './firebase';
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

function valueOrNull<T>(snap: { val: () => unknown }): T | null {
  const v = snap.val();
  return v == null ? null : (v as T);
}

export class FirebaseDataStore implements DataStoreAPI {
  readonly mode = 'firebase' as const;

  // ---------- users ----------
  async listUsers(): Promise<UserRecord[]> {
    if (!db) return [];
    const snap = await fGet(r(db, 'users'));
    const obj = valueOrNull<Record<string, UserRecord>>(snap) || {};
    return Object.entries(obj).map(([k, v]) => ({ ...v, uid: k }));
  }
  async getUser(uid: string): Promise<UserRecord | null> {
    if (!db) return null;
    const snap = await fGet(r(db, `users/${uid}`));
    if (!snap.exists()) return null;
    return { ...(snap.val() as UserRecord), uid };
  }
  async upsertUser(uid: string, patch: Partial<UserRecord>): Promise<void> {
    if (!db) return;
    await fUpdate(r(db, `users/${uid}`), patch as Record<string, unknown>);
  }
  async deleteUser(uid: string): Promise<void> {
    if (!db) return;
    await fSet(r(db, `users/${uid}`), null);
  }
  async setUserBanned(uid: string, banned: boolean): Promise<void> {
    return this.upsertUser(uid, { banned });
  }
  async adjustUserBalance(uid: string, delta: number): Promise<number> {
    if (!db) throw new Error('Firebase not configured');
    // Use a server-side transaction so concurrent admin approvals on
    // the same user can't clobber each other. The previous read-
    // modify-write would silently drop one of two simultaneous credits
    // if the read happened before the other write had replicated.
    const userRef = r(db, `users/${uid}`);
    const result = await runTransaction(userRef, (cur) => {
      const u = (cur as UserRecord | null) || {
        uid,
        balance: 0,
        income: 0,
        commission: 0,
      };
      const next = (Number(u.balance) || 0) + delta;
      // Preserve every other field on the user record — runTransaction
      // replaces the node value, so we have to spread the existing
      // shape back in.
      return { ...u, balance: next };
    });
    if (!result.committed) {
      throw new Error('Balance update was not committed (transaction aborted)');
    }
    const updated = result.snapshot.val() as UserRecord | null;
    return Number(updated?.balance ?? 0);
  }

  // -----------------------------------------------------------------
  // Referral chain + commission distribution.
  //
  // The user app stores each new sign-up's invite-code (the APX-XXXXXX
  // of the person who referred them) in `users/{uid}.referrer`. To
  // walk the chain we have to look that code up — there is no
  // secondary index by invite code, so we do a one-shot read of the
  // `users/` node and filter in memory. The read is bounded by the
  // user count which in practice is small relative to deposits.
  // -----------------------------------------------------------------
  async findUserByInviteCode(code: string): Promise<{ uid: string; profile: UserRecord } | null> {
    if (!db || !code) return null;
    const target = code.trim().toUpperCase();
    if (!target) return null;
    const snap = await fGet(r(db, 'users'));
    const raw = snap.val();
    if (!raw || typeof raw !== 'object') return null;
    const entries = Object.entries(raw as Record<string, UserRecord>);
    for (const [uid, profile] of entries) {
      if (!profile || typeof profile !== 'object') continue;
      // The user app always writes `inviteCode`; the admin's local
      // type happens to use `refCode`. Accept either so the chain
      // lookup works against data written by either side.
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
    if (!db) return { level1: null, level2: null, level3: null };
    // Read the depositing user to find their referrer invite code.
    const userSnap = await fGet(r(db, `users/${uid}`));
    const user = userSnap.val() as
      | (UserRecord & { referrer?: string; referredBy?: string })
      | null;
    if (!user) return { level1: null, level2: null, level3: null };
    // The user app writes `referrer`; the admin's local type writes
    // `referredBy`. Accept either.
    const l1Code =
      (typeof user.referrer === 'string' && user.referrer) ||
      (typeof user.referredBy === 'string' && user.referredBy) ||
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

  // Atomic balance credit + transaction-log append. Uses runTransaction
  // so a concurrent admin approval on the same user can't drop one of
  // the two writes. The transaction log mirrors the shape the user app
  // already renders in the History page (type=bonus, status=approved).
  async creditReferralCommission(
    referrerUid: string,
    amount: number,
    level: 1 | 2 | 3,
    depositAmount: number,
    sourceUserPhone: string,
  ): Promise<void> {
    if (!db) return;
    if (!Number.isFinite(amount) || amount <= 0) return;
    const userRef = r(db, `users/${referrerUid}`);
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
    const result = await runTransaction(userRef, (cur) => {
      const u = (cur as UserRecord | null) || {
        uid: referrerUid,
        balance: 0,
        income: 0,
        commission: 0,
      };
      const nextBalance = (Number(u.balance) || 0) + amount;
      const nextCommission = (Number(u.commission) || 0) + amount;
      const existingTx = Array.isArray(u.transactions) ? (u.transactions as unknown[]) : [];
      const mergedTx = [newTx, ...existingTx].slice(0, 200);
      // Spread first so the new fields override, then explicitly set
      // balance / commission / transactions to avoid any chance of
      // losing the new values.
      return {
        ...u,
        balance: nextBalance,
        commission: nextCommission,
        transactions: mergedTx,
      };
    });
    if (!result.committed) {
      throw new Error('Commission credit was not committed (transaction aborted)');
    }
  }

  // Distribute the 3-level commission tree for a deposit.
  // Returns the per-level payouts that were applied (for toast /
  // logging). Rates are read live from the admin-published
  // `settings/config` node (referralLevel1/2/3 are percentages, e.g.
  // 20 = 20%), so changing a rate in the admin Settings panel takes
  // effect on the very next approved deposit — no redeploy, no cache
  // flush. Setting any rate to 0 disables that level without breaking
  // the chain; the other levels still pay out normally.
  async distributeReferralCommission(
    sourceUid: string,
    sourcePhone: string,
    depositAmount: number,
  ): Promise<Array<{ level: 1 | 2 | 3; uid: string; amount: number }>> {
    if (!Number.isFinite(depositAmount) || depositAmount <= 0) return [];
    // Pull the live commission rates from the admin-published config.
    // Fall back to the env defaults if the node is unreadable so the
    // commission flow still works in degraded mode.
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
        // Don't abort the whole chain on one failure — log and move on.
        // eslint-disable-next-line no-console
        console.error(`[referral] level ${e.level} credit failed`, err);
      }
    }
    return payouts;
  }

  onUsersChange(cb: (u: UserRecord[]) => void): Unsubscribe {
    if (!db) return () => {};
    const unsub = fOn(r(db, 'users'), (snap) => {
      const obj = valueOrNull<Record<string, UserRecord>>(snap) || {};
      cb(Object.entries(obj).map(([k, v]) => ({ ...v, uid: k })));
    });
    return unsub;
  }

  // ---------- deposits ----------
  async listDeposits(): Promise<DepositRecord[]> {
    if (!db) return [];
    const snap = await fGet(r(db, 'deposits'));
    const obj = valueOrNull<Record<string, DepositRecord>>(snap) || {};
    return Object.entries(obj)
      .map(([k, v]) => ({ ...v, id: k }))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }
  async createDeposit(input: Omit<DepositRecord, 'id'>): Promise<string> {
    if (!db) throw new Error('Firebase not configured');
    const ref = await fPush(r(db, 'deposits'), input as unknown as Record<string, unknown>);
    return ref.key || `dep_${Date.now()}`;
  }
  async updateDepositStatus(id: string, status: TxnStatus): Promise<void> {
    if (!db) return;
    await fUpdate(r(db, `deposits/${id}`), { status });
  }
  async updateDeposit(id: string, patch: Partial<DepositRecord>): Promise<void> {
    if (!db) return;
    await fUpdate(r(db, `deposits/${id}`), patch as Record<string, unknown>);
  }
  async deleteRejectedDeposits(): Promise<number> {
    if (!db) return 0;
    const snap = await fGet(r(db, 'deposits'));
    const obj = valueOrNull<Record<string, DepositRecord>>(snap) || {};
    const updates: Record<string, null> = {};
    let n = 0;
    Object.entries(obj).forEach(([k, v]) => {
      if (v.status === 'reject') {
        updates[`deposits/${k}`] = null;
        n++;
      }
    });
    if (n > 0) await fUpdate(r(db), updates as unknown as Record<string, unknown>);
    return n;
  }
  onDepositsChange(cb: (r: DepositRecord[]) => void): Unsubscribe {
    if (!db) return () => {};
    const unsub = fOn(r(db, 'deposits'), (snap) => {
      const obj = valueOrNull<Record<string, DepositRecord>>(snap) || {};
      cb(
        Object.entries(obj)
          .map(([k, v]) => ({ ...v, id: k }))
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
      );
    });
    return unsub;
  }

  // ---------- withdrawals ----------
  async listWithdrawals(): Promise<WithdrawalRecord[]> {
    if (!db) return [];
    const snap = await fGet(r(db, 'withdrawals'));
    const obj = valueOrNull<Record<string, WithdrawalRecord>>(snap) || {};
    return Object.entries(obj)
      .map(([k, v]) => ({ ...v, id: k }))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }
  async createWithdrawal(input: Omit<WithdrawalRecord, 'id'>): Promise<string> {
    if (!db) throw new Error('Firebase not configured');
    const ref = await fPush(r(db, 'withdrawals'), input as unknown as Record<string, unknown>);
    return ref.key || `wd_${Date.now()}`;
  }
  async updateWithdrawalStatus(id: string, status: TxnStatus): Promise<void> {
    if (!db) return;
    await fUpdate(r(db, `withdrawals/${id}`), { status });
  }

  // Refund a rejected withdrawal. The user side deducts the balance
  // when the request is submitted, so a rejection has to add it
  // back. Both the balance credit AND the refund transaction log
  // entry are written atomically inside a single runTransaction on
  // the user record so a partial write can't leave the user out of
  // sync. The refund entry is visible in the user's History page
  // the next time their profile listener refires.
  async refundWithdrawal(
    uid: string,
    amount: number,
    withdrawalId: string,
  ): Promise<void> {
    if (!db) return;
    if (!Number.isFinite(amount) || amount <= 0) return;
    const userRef = r(db, `users/${uid}`);
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
    const result = await runTransaction(userRef, (cur) => {
      const u = (cur as UserRecord | null) || {
        uid,
        balance: 0,
        income: 0,
        commission: 0,
      };
      const nextBalance = (Number(u.balance) || 0) + amount;
      const existingTx = Array.isArray(u.transactions)
        ? (u.transactions as unknown[])
        : [];
      const mergedTx = [newTx, ...existingTx].slice(0, 200);
      return {
        ...u,
        balance: nextBalance,
        transactions: mergedTx,
      };
    });
    if (!result.committed) {
      throw new Error('Refund was not committed (transaction aborted)');
    }
  }
  onWithdrawalsChange(cb: (r: WithdrawalRecord[]) => void): Unsubscribe {
    if (!db) return () => {};
    const unsub = fOn(r(db, 'withdrawals'), (snap) => {
      const obj = valueOrNull<Record<string, WithdrawalRecord>>(snap) || {};
      cb(
        Object.entries(obj)
          .map(([k, v]) => ({ ...v, id: k }))
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
      );
    });
    return unsub;
  }

  // ---------- plans ----------
  async listPlans(): Promise<AdminPlan[]> {
    if (!db) return [];
    const snap = await fGet(r(db, 'plans'));
    const obj = valueOrNull<Record<string, AdminPlan>>(snap) || {};
    return Object.entries(obj)
      .map(([k, v]) => ({ ...v, id: k }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  async upsertPlan(plan: AdminPlan): Promise<void> {
    if (!db) return;
    const { id, ...rest } = plan;
    await fSet(r(db, `plans/${id}`), rest);
  }
  async deletePlan(id: string): Promise<void> {
    if (!db) return;
    await fSet(r(db, `plans/${id}`), null);
  }
  onPlansChange(cb: (r: AdminPlan[]) => void): Unsubscribe {
    if (!db) return () => {};
    const unsub = fOn(r(db, 'plans'), (snap) => {
      const obj = valueOrNull<Record<string, AdminPlan>>(snap) || {};
      cb(
        Object.entries(obj)
          .map(([k, v]) => ({ ...v, id: k }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      );
    });
    return unsub;
  }

  /**
   * Give a plan to a user. Charges the user (deducts the plan price
   * from their balance) or gifts it (no deduction) depending on
   * `chargeUser`. In both cases:
   *   - An active Investment record is appended to the user's
   *     `investments` array (this is what powers MyInvestments on
   *     the user side).
   *   - A transaction row is appended to the user's transaction
   *     log so the History page shows the assignment.
   *   - The auth-context daily-income scheduler will pick the new
   *     investment up on its next pass and start crediting daily
   *     income, no extra work needed here.
   */
  async giveInvestmentPlan(input: {
    uid: string;
    planId: string;
    chargeUser: boolean;
    adminNote?: string;
  }): Promise<{ ok: true; investmentId: string } | { ok: false; reason: string }> {
    if (!db) return { ok: false, reason: 'Firebase not configured' };

    // 1. Load the plan and the user up front so we can validate
    //    before touching anything.
    const [planSnap, userSnap] = await Promise.all([
      fGet(r(db, `plans/${input.planId}`)),
      fGet(r(db, `users/${input.uid}`)),
    ]);
    if (!planSnap.exists()) return { ok: false, reason: 'Plan not found' };
    if (!userSnap.exists()) return { ok: false, reason: 'User not found' };

    const plan = { id: input.planId, ...(planSnap.val() as Omit<AdminPlan, 'id'>) };
    const user = userSnap.val() as UserRecord;

    const price = Number(plan.price) || 0;
    const dailyIncome = Number(plan.dailyIncome) || 0;
    const duration = Number(plan.duration) || 0;
    if (price <= 0 || dailyIncome <= 0 || duration <= 0) {
      return { ok: false, reason: 'Plan is missing required fields' };
    }

    // 2. If the admin is charging the user, verify they can cover
    //    it. The deduction + investment push happen inside a single
    //    transaction so a partial write is impossible.
    if (input.chargeUser) {
      const currentBalance = Number(user.balance) || 0;
      if (currentBalance < price) {
        return {
          ok: false,
          reason: `User balance ${currentBalance.toFixed(2)} ETB is below the plan price ${price.toFixed(2)} ETB.`,
        };
      }
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
      // Mark the row so the user side can render an "Assigned by
      // admin" badge if it wants to. The user-side code already
      // ignores unknown fields.
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

    const userRef = r(db, `users/${input.uid}`);
    const result = await runTransaction(userRef, (cur) => {
      const u = (cur as UserRecord | null) || {
        uid: input.uid,
        balance: 0,
        income: 0,
        commission: 0,
      };
      const balance = Number(u.balance) || 0;
      if (input.chargeUser && balance < price) {
        // Re-check inside the transaction in case the balance
        // changed between our pre-flight read and now.
        return cur;
      }
      const nextBalance = input.chargeUser ? balance - price : balance;
      const existingInvestments = Array.isArray(u.investments) ? u.investments : [];
      const existingTransactions = Array.isArray(u.transactions) ? u.transactions : [];
      return {
        ...u,
        balance: nextBalance,
        investments: [newInvestment, ...existingInvestments],
        transactions: [transactionRow, ...existingTransactions],
      };
    });

    if (!result.committed) {
      return { ok: false, reason: 'Assignment was not committed (transaction aborted)' };
    }
    return { ok: true, investmentId };
  }

  // ---------- banks ----------
  async listBanks(): Promise<BankRecord[]> {
    if (!db) return [];
    const snap = await fGet(r(db, 'settings/paymentMethods'));
    const obj = valueOrNull<Record<string, BankRecord>>(snap) || {};
    return Object.entries(obj).map(([k, v]) => ({ ...v, id: k }));
  }
  async addBank(input: Omit<BankRecord, 'id'>): Promise<string> {
    if (!db) throw new Error('Firebase not configured');
    const ref = await fPush(r(db, 'settings/paymentMethods'), { ...input, enabled: true });
    return ref.key || `bank_${Date.now()}`;
  }
  async updateBank(id: string, patch: Partial<Omit<BankRecord, 'id'>>): Promise<void> {
    if (!db) return;
    await fUpdate(r(db, `settings/paymentMethods/${id}`), patch as Record<string, unknown>);
  }
  async deleteBank(id: string): Promise<void> {
    if (!db) return;
    await fSet(r(db, `settings/paymentMethods/${id}`), null);
  }
  onBanksChange(cb: (r: BankRecord[]) => void): Unsubscribe {
    if (!db) return () => {};
    const unsub = fOn(r(db, 'settings/paymentMethods'), (snap) => {
      const obj = valueOrNull<Record<string, BankRecord>>(snap) || {};
      cb(Object.entries(obj).map(([k, v]) => ({ ...v, id: k })));
    });
    return unsub;
  }

  // ---------- gift codes ----------
  async listGiftCodes(): Promise<GiftCodeRecord[]> {
    if (!db) return [];
    const snap = await fGet(r(db, 'giftCodes'));
    const obj = valueOrNull<Record<string, GiftCodeRecord>>(snap) || {};
    return Object.entries(obj)
      .map(([k, v]) => ({ ...v, key: k }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  async createGiftCode(input: {
    key: string;
    amount: number;
    maxUses: number;
    expiresAt: number | null;
  }): Promise<void> {
    if (!db) return;
    await fSet(r(db, `giftCodes/${input.key}`), {
      amount: input.amount,
      maxUses: input.maxUses,
      status: 'active',
      createdAt: Date.now(),
      expiresAt: input.expiresAt,
      usedByList: [],
    });
  }
  async deleteGiftCode(code: string): Promise<void> {
    if (!db) return;
    await fSet(r(db, `giftCodes/${code}`), null);
  }
  async redeemGiftCode(code: string, uid: string) {
    if (!db) return { ok: false as const, reason: 'Firebase not configured' };
    const codeRef = r(db, `giftCodes/${code}`);
    const snap = await fGet(codeRef);
    if (!snap.exists()) return { ok: false as const, reason: 'Invalid code' };
    const entry = snap.val() as GiftCodeRecord;
    if (entry.status !== 'active') return { ok: false as const, reason: 'Code already used' };
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      return { ok: false as const, reason: 'Code expired' };
    }
    // Multi-use codes: each user can claim once. `usedByList` is the
    // canonical list of uids that have already redeemed; if this uid
    // is in it, the same user is trying to claim twice.
    const usedList = Array.isArray(entry.usedByList) ? entry.usedByList : [];
    if (usedList.includes(uid)) {
      return { ok: false as const, reason: 'You already used this code' };
    }
    const max = typeof entry.maxUses === 'number' && entry.maxUses > 0 ? entry.maxUses : 1;
    if (usedList.length >= max) {
      return { ok: false as const, reason: 'Code already fully claimed' };
    }
    let claimed = false;
    await runTransaction(codeRef, (cur) => {
      if (!cur) return cur;
      const c = cur as GiftCodeRecord;
      if (c.status !== 'active') return undefined;
      const curList = Array.isArray(c.usedByList) ? c.usedByList : [];
      if (curList.includes(uid)) return undefined;
      const curMax = typeof c.maxUses === 'number' && c.maxUses > 0 ? c.maxUses : 1;
      if (curList.length >= curMax) return undefined;
      const nextList = [...curList, uid];
      claimed = true;
      return {
        ...c,
        status: nextList.length >= curMax ? 'used' : 'active',
        usedByList: nextList,
        // Keep the legacy `usedBy` field set to the most recent
        // redeemer so anything else that reads it (older admin
        // versions) still has something meaningful to display.
        usedBy: uid,
        usedAt: Date.now(),
      };
    });
    if (!claimed) return { ok: false as const, reason: 'Code already used' };
    return { ok: true as const, amount: entry.amount };
  }
  onGiftCodesChange(cb: (r: GiftCodeRecord[]) => void): Unsubscribe {
    if (!db) return () => {};
    const unsub = fOn(r(db, 'giftCodes'), (snap) => {
      const obj = valueOrNull<Record<string, GiftCodeRecord>>(snap) || {};
      cb(
        Object.entries(obj)
          .map(([k, v]) => ({ ...v, key: k }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
      );
    });
    return unsub;
  }

  // ---------- settings ----------
  async getConfig(): Promise<AppConfig> {
    if (!db) return DEFAULT_APP_CONFIG;
    const snap = await fGet(r(db, 'settings/config'));
    const v = valueOrNull<Partial<AppConfig>>(snap) || {};
    return { ...DEFAULT_APP_CONFIG, ...v };
  }
  async saveConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
    if (!db) return DEFAULT_APP_CONFIG;
    await fUpdate(r(db, 'settings/config'), patch as Record<string, unknown>);
    return this.getConfig();
  }
  async getTelegramLinks(): Promise<TelegramLinks> {
    if (!db) return DEFAULT_TELEGRAM_LINKS;
    const snap = await fGet(r(db, 'settings/telegram'));
    const v = valueOrNull<Partial<TelegramLinks>>(snap) || {};
    return { ...DEFAULT_TELEGRAM_LINKS, ...v };
  }
  async saveTelegramLinks(patch: Partial<TelegramLinks>): Promise<TelegramLinks> {
    if (!db) return DEFAULT_TELEGRAM_LINKS;
    await fUpdate(r(db, 'settings/telegram'), patch as Record<string, unknown>);
    return this.getTelegramLinks();
  }
  onConfigChange(cb: (cfg: AppConfig) => void): Unsubscribe {
    if (!db) return () => {};
    const unsub = fOn(r(db, 'settings/config'), (snap) => {
      const v = valueOrNull<Partial<AppConfig>>(snap) || {};
      cb({ ...DEFAULT_APP_CONFIG, ...v });
    });
    return unsub;
  }
  onTelegramChange(cb: (tg: TelegramLinks) => void): Unsubscribe {
    if (!db) return () => {};
    const unsub = fOn(r(db, 'settings/telegram'), (snap) => {
      const v = valueOrNull<Partial<TelegramLinks>>(snap) || {};
      cb({ ...DEFAULT_TELEGRAM_LINKS, ...v });
    });
    return unsub;
  }
}
