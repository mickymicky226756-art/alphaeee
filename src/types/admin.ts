// ----------------------------------------------------------------------
// Domain types — shared between admin panel + user-facing app.
// Both projects read/write the same shape in Firebase RTDB.
// ----------------------------------------------------------------------

export type TxnStatus = 'pending' | 'approve' | 'reject';

/** A user record as stored in the shared data store. Phone is the key. */
export interface UserRecord {
  uid: string;            // phone or generated id
  name?: string;
  phone?: string;
  password?: string;
  balance: number;        // current wallet balance (ETB)
  income: number;         // lifetime income earned (ETB)
  commission: number;     // lifetime referral commission (ETB)
  spins?: number;
  refCode?: string;       // this user's invite code (admin-side name)
  inviteCode?: string;    // this user's invite code (user-side name; same as refCode)
  referredBy?: string;    // inviter phone / code (admin-side name)
  referrer?: string;      // inviter invite code (user-side name; same as referredBy)
  bankInfo?: {
    bankName?: string;
    accName?: string;
    accNum?: string;
  };
  plans?: Record<string, UserPlanSummary>;
  banned?: boolean;
  joinedAt?: number;
  firstDepositDone?: boolean;
  // Local transaction log kept on the user profile by the user app.
  // The admin's commission-credit function appends to this array so
  // the referrer sees the commission entry the next time their
  // profile listener refires.
  transactions?: unknown[];
  // Active investments stored on the user profile by the user app.
  // The admin "Assign Plan" feature appends here too so the
  // user-side MyInvestments view picks up admin-assigned plans via
  // its RTDB subscription without any extra glue.
  investments?: unknown[];
}

export interface UserPlanSummary {
  name?: string;
  price?: number;
  dailyIncome?: number;
  duration?: number;
  daysClaimed?: number;
  active?: boolean;
}

/** A deposit request (CBE cashier -> admin queue). */
export interface DepositRecord {
  id: string;
  user: string;           // user uid / phone
  userPhone?: string;     // denormalized phone so admin can contact the user without an extra user lookup
  amount: number;         // ETB
  method: 'cbe';
  senderName?: string;
  transId?: string;       // Reference Number entered on the cashier page
  status: TxnStatus;
  date?: string;          // human-readable timestamp, e.g. "Sep 3, 2026, 4:41 PM"
  timestamp: number;
  orderId?: string;
}

/** A withdrawal request (user -> admin queue). */
export interface WithdrawalRecord {
  id: string;
  user: string;
  amount: number;         // ETB, before fee
  netAmount: number;      // ETB, after fee
  method: 'cbe';
  bankName?: string;
  accName?: string;
  accNum?: string;
  status: TxnStatus;
  date?: string;
  timestamp: number;
}

/** A bank / payment method shown to users in the deposit flow. */
export interface BankRecord {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  enabled?: boolean;
}

/** A gift code managed by the admin. */
export interface GiftCodeRecord {
  key: string;            // the code itself, uppercase
  /** Fixed reward (Birr) credited to a user's balance when they redeem. */
  amount: number;
  /**
   * How many distinct users may redeem this code. The admin sets
   * this at creation time (e.g. 100 for a promo). Defaults to 1 for
   * single-use codes so legacy records still work.
   */
  maxUses?: number;
  status: 'active' | 'used' | 'expired';
  createdAt: number;
  expiresAt: number | null;
  /**
   * List of uids that have already redeemed the code. We track each
   * uid so a single user can't claim the same multi-use code twice.
   * Legacy single-use codes may have `usedBy` as a string; new codes
   * always use this array.
   */
  usedByList?: string[];
  /**
   * @deprecated kept for backward compatibility with single-use
   * records created before multi-use was added. New code reads
   * should always use `usedByList`.
   */
  usedBy?: string;
  usedAt?: number;
}

/** Global config — what the user-facing app reads at runtime. */
export interface AppConfig {
  minDeposit: number;
  minWithdraw: number;
  withdrawalFee: number;          // percent
  registrationBonus: number;
  /** Hard ceiling on a single day's total successful withdrawal value. */
  maxDailyWithdraw: number;
  /** Inclusive lower bound, in hours, of the advertised processing window. */
  processingHoursMin: number;
  /** Inclusive upper bound, in hours, of the advertised processing window. */
  processingHoursMax: number;
  /**
   * Referral commission rates — all expressed as percentages (e.g. 20
   * = 20% of the deposit, not 0.20). Level 1 is the direct referrer,
   * level 2 the referrer's referrer, level 3 the third hop up the
   * chain. Setting any of them to 0 disables payouts for that level
   * without breaking the chain — the rest still pay out normally.
   */
  referralLevel1: number;
  referralLevel2: number;
  referralLevel3: number;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  minDeposit: 600,
  minWithdraw: 100,
  withdrawalFee: 18,
  registrationBonus: 1000,
  maxDailyWithdraw: 1_000_000,
  processingHoursMin: 1,
  processingHoursMax: 48,
  referralLevel1: 20,
  referralLevel2: 2,
  referralLevel3: 1,
};

export interface TelegramLinks {
  channel: string;
  group: string;
  service: string;
}

export const DEFAULT_TELEGRAM_LINKS: TelegramLinks = {
  channel: 'https://t.me/AlphaTradingChannel',
  group: 'https://t.me/AlphaTradingGroup',
  service: 'https://t.me/AlphaTradingSupport',
};

export type PlanCategory = 'natural' | 'vip';

/** An investment plan managed by the admin (display shape). */
export interface AdminPlan {
  id: string;
  title: string;
  description: string;
  price: number;            // exact sample price (ETB) — fixed product price
  dailyIncome: number;      // exact daily income amount (ETB)
  duration: number;         // days
  totalReturn: number;      // total income amount (ETB)
  buyLimit: number;         // max purchases per user
  tag?: 'hot' | 'new' | 'vip';
  image?: string;
  enabled: boolean;
  order?: number;
}
