// ----------------------------------------------------------------------
// DataStore — single source of truth that both halves of the app talk to.
//
// Two backends:
//   • Firebase RTDB (when VITE_FIREBASE_* is configured) — production
//   • localStorage + window event bus (demo mode) — local development
//
// The async API is identical so the admin sections don't care which
// backend is live.
// ----------------------------------------------------------------------

import type {
  AppConfig,
  AdminPlan,
  BankRecord,
  DepositRecord,
  GiftCodeRecord,
  TelegramLinks,
  UserRecord,
  WithdrawalRecord,
} from '../types/admin';
import { isFirebaseConfigured } from '../config/env';
import { FirebaseDataStore } from './dataStore.firebase';
import { DemoDataStore } from './dataStore.demo';

export type Unsubscribe = () => void;

export interface DataStoreAPI {
  readonly mode: 'firebase' | 'demo';

  // ---- users ---------------------------------------------------------
  listUsers(): Promise<UserRecord[]>;
  getUser(uid: string): Promise<UserRecord | null>;
  upsertUser(uid: string, patch: Partial<UserRecord>): Promise<void>;
  deleteUser(uid: string): Promise<void>;
  setUserBanned(uid: string, banned: boolean): Promise<void>;
  adjustUserBalance(uid: string, delta: number): Promise<number>;
  // Referral chain + commission distribution. The 3 level rates are
  // read live from the admin-published `settings/config` node on
  // every call, so changing a rate in the admin Settings panel takes
  // effect on the very next approved deposit — no redeploy, no cache
  // flush, no per-call env override.
  getReferralChain(uid: string): Promise<{
    level1: string | null;
    level2: string | null;
    level3: string | null;
  }>;
  distributeReferralCommission(
    sourceUid: string,
    sourcePhone: string,
    depositAmount: number,
  ): Promise<Array<{ level: 1 | 2 | 3; uid: string; amount: number }>>;
  onUsersChange(cb: (users: UserRecord[]) => void): Unsubscribe;

  // ---- deposits ------------------------------------------------------
  listDeposits(): Promise<DepositRecord[]>;
  createDeposit(input: Omit<DepositRecord, 'id'>): Promise<string>;
  updateDepositStatus(id: string, status: DepositRecord['status']): Promise<void>;
  updateDeposit(id: string, patch: Partial<DepositRecord>): Promise<void>;
  deleteRejectedDeposits(): Promise<number>;
  onDepositsChange(cb: (rows: DepositRecord[]) => void): Unsubscribe;

  // ---- withdrawals ---------------------------------------------------
  listWithdrawals(): Promise<WithdrawalRecord[]>;
  createWithdrawal(input: Omit<WithdrawalRecord, 'id'>): Promise<string>;
  updateWithdrawalStatus(id: string, status: WithdrawalRecord['status']): Promise<void>;
  // Refund a rejected withdrawal: add the gross amount back to the
  // user's balance and append a refund entry to their transaction
  // log. The user side deducts on submit, so a rejection MUST
  // refund — never just mark the request rejected.
  refundWithdrawal(uid: string, amount: number, withdrawalId: string): Promise<void>;
  onWithdrawalsChange(cb: (rows: WithdrawalRecord[]) => void): Unsubscribe;

  // ---- plans (admin-managed) ----------------------------------------
  listPlans(): Promise<AdminPlan[]>;
  upsertPlan(plan: AdminPlan): Promise<void>;
  deletePlan(id: string): Promise<void>;
  onPlansChange(cb: (rows: AdminPlan[]) => void): Unsubscribe;
  /**
   * Give (assign) a plan to a user. The admin chooses whether to
   * charge the user (deduct the plan price from their balance) or
   * gift it (no deduction). Either way, an active Investment record
   * is appended to the user's `investments` array and a matching
   * transaction row is written to their transaction log so the
   * user-side MyInvestments and Transactions views pick it up
   * immediately via their RTDB subscriptions.
   */
  giveInvestmentPlan(input: {
    uid: string;
    planId: string;
    chargeUser: boolean;
    adminNote?: string;
  }): Promise<{ ok: true; investmentId: string } | { ok: false; reason: string }>;

  // ---- banks ---------------------------------------------------------
  listBanks(): Promise<BankRecord[]>;
  addBank(input: Omit<BankRecord, 'id'>): Promise<string>;
  updateBank(id: string, patch: Partial<Omit<BankRecord, 'id'>>): Promise<void>;
  deleteBank(id: string): Promise<void>;
  onBanksChange(cb: (rows: BankRecord[]) => void): Unsubscribe;

  // ---- gift codes ----------------------------------------------------
  listGiftCodes(): Promise<GiftCodeRecord[]>;
  createGiftCode(input: {
    key: string;
    amount: number;
    maxUses: number;
    expiresAt: number | null;
  }): Promise<void>;
  deleteGiftCode(code: string): Promise<void>;
  redeemGiftCode(
    code: string,
    uid: string,
  ): Promise<{ ok: boolean; amount?: number; reason?: string }>;
  onGiftCodesChange(cb: (rows: GiftCodeRecord[]) => void): Unsubscribe;

  // ---- settings ------------------------------------------------------
  getConfig(): Promise<AppConfig>;
  saveConfig(cfg: Partial<AppConfig>): Promise<AppConfig>;
  getTelegramLinks(): Promise<TelegramLinks>;
  saveTelegramLinks(tg: Partial<TelegramLinks>): Promise<TelegramLinks>;
  onConfigChange(cb: (cfg: AppConfig) => void): Unsubscribe;
  onTelegramChange(cb: (tg: TelegramLinks) => void): Unsubscribe;
}

let _instance: DataStoreAPI | null = null;

export function getDataStore(): DataStoreAPI {
  if (_instance) return _instance;
  _instance = isFirebaseConfigured ? new FirebaseDataStore() : new DemoDataStore();
  if (typeof window !== 'undefined') {
    (window as unknown as { dataStore: DataStoreAPI }).dataStore = _instance;
  }
  return _instance;
}
