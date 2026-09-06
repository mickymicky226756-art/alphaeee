# Alpha Trading — Admin Panel

> A standalone React + TypeScript + Vite admin panel for the
> [alpha-trading](../alpha-trading) user-facing app. Manages users,
> deposits, withdrawals, plans, banks, gift codes and platform settings.

## ✨ Features

- **Dashboard** — total users, pending requests, approved deposits/withdrawals, active gift codes, total user balance. Inline-SVG 7-day volume chart, recent activity feed, quick actions.
- **Users** — search by phone/name/refcode, filter (all / active / banned / top balance), full edit modal (balance add/deduct, password reset, bank info, ban/unban, delete).
- **Transactions** — tabs for Pending / Approved Deposits / Approved Withdrawals / Rejected. Approve credits the user's balance, reject refunds withdrawals. Bulk-clear rejected.
- **Investment Plans** — full CRUD with title, image, min/max amount, daily return %, duration, total return %, tag, enabled flag, order. Persisted to the same data layer the user app reads.
- **Bank Accounts** — add/delete. The CBE (Commercial Bank of Ethiopia) gateway page in the user app auto-picks the latest matching account.
- **Gift Codes** — create with min/max random reward + optional expiry. Each code is single-use. Appears instantly in the user app's Gift Redeem screen.
- **Settings** — min deposit, min withdraw, withdrawal fee, registration bonus, Telegram channel/group/service links. Live for all users.

## 🔌 Architecture

The admin panel shares **the same Firebase Realtime Database** as the user-facing app. Both halves see the same data; admin decisions (approve/reject, balance change, gift code publish, etc.) propagate to the user app in real time.

```
┌─────────────────────┐      ┌─────────────────────┐
│   alpha-trading     │      │ alpha-trading-admin │
│  (user-facing app)  │      │   (this project)    │
└──────────┬──────────┘      └──────────┬──────────┘
           │                            │
           │  read/write  ◄────────►    │  read/write
           │                            │
           ▼                            ▼
       ┌───────────────────────────────────────┐
       │   Firebase Realtime Database (RTDB)   │
       │   • users/{uid}                       │
       │   • deposits/{id}                     │
       │   • withdrawals/{id}                  │
       │   • plans/{id}                        │
       │   • settings/paymentMethods/{id}      │
       │   • settings/config                   │
       │   • settings/telegram                 │
       │   • giftCodes/{code}                  │
       └───────────────────────────────────────┘
```

If Firebase isn't configured, the panel falls back to **demo mode** (localStorage), so you can explore every feature without provisioning a project.

## 🚀 Quick start

### 1. Install

```bash
cd alpha-trading-admin
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Open `.env` and fill in:

- **`VITE_ADMIN_ID`** / **`VITE_ADMIN_PASSWORD`** — change the defaults before going live (default: `44` / `a444`).
- **`VITE_FIREBASE_*`** — your Firebase project config (see below).

If you skip the Firebase env vars the panel runs in **demo mode** with localStorage.

### 3. Run

```bash
npm run dev          # http://localhost:5174
npm run build        # production bundle
npm run preview      # serve the production bundle
npm run typecheck    # tsc --noEmit
```

Default login: **`44` / `a444`**. Change via env.

## 🔥 Firebase setup (live mode)

Both the admin and the user-facing app must point at the **same** Firebase project.

### One-time setup

1. **Create a Firebase project** at https://console.firebase.google.com (or reuse an existing one).
2. **Add a Web app**: Project settings → General → "Your apps" → click `</>`.
3. **Copy the config** into `.env` of both `alpha-trading/` and `alpha-trading-admin/`.
4. **Enable Realtime Database**: Build → Realtime Database → Create database (any region).
5. **Set the database rules** to the ones in `database.rules.json` (shipped). For production, lock these down to authenticated writes only — see "Security" below.
6. **Done.** Both projects now share the same data.

### Seed sample data (optional)

The user app auto-seeds a few plans and the panel starts empty. To populate it quickly:

1. Sign up a user in the user-facing app — that creates a `users/{uid}` record.
2. Open the admin panel, sign in, and the user will appear under **Users**.
3. Use **Plans**, **Banks**, **Gifts** to populate. Changes appear in the user app within milliseconds.

## 🛡️ Security

The shipped `database.rules.json` is **permissive** (anyone with the database URL can read+write). This matches the original HTML reference but is **NOT production-safe**.

For production:

- **Tighten the rules** so only the admin can write `deposits/{id}/status`, `withdrawals/{id}/status`, `plans/`, `banks/`, `giftCodes/`, `users/{uid}/balance`, `users/{uid}/banned`, `settings/`.
- **Enable Firebase Auth** and authenticate admin requests with a custom token.
- **Never ship admin credentials in env** that the user-facing app bundle can read — keep them only in the admin project.

The included `database.rules.json` is a **starting point** that you must lock down.

## 🚢 Deployment

### Vercel

```bash
npm i -g vercel
vercel          # follow prompts; add .env values in the Vercel dashboard
vercel --prod
```

`vercel.json` is included and sets up SPA rewrites + cache headers.

### Firebase Hosting

```bash
npm i -g firebase-tools
firebase login
firebase use --add          # select your project
firebase deploy --only hosting
```

`firebase.json` is included.

### Other static hosts (Netlify, Cloudflare Pages, S3, …)

Run `npm run build` and deploy `dist/`. Configure your host to serve `index.html` for unknown routes (SPA rewrite).

## 🔌 Pointing the user-facing app at the same Firebase

In `alpha-trading/.env` use the **same** `VITE_FIREBASE_*` values. Both apps will then talk to the same database.

```bash
# alpha-trading/.env  AND  alpha-trading-admin/.env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_DATABASE_URL=...
# ... etc
```

Restart both dev servers after env changes.

## 📁 Project structure

```
alpha-trading-admin/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .env.example
├── .gitignore
├── README.md
├── vercel.json             # Vercel deploy config
├── firebase.json           # Firebase Hosting config
├── database.rules.json     # Starting RTDB rules
└── src/
    ├── main.tsx
    ├── vite-env.d.ts
    ├── config/
    │   └── env.ts          # centralised env reader
    ├── types/
    │   └── admin.ts        # domain types (shared with user app)
    ├── services/
    │   ├── firebase.ts     # Firebase bootstrap
    │   ├── dataStore.ts    # DataStore interface + factory
    │   ├── dataStore.firebase.ts
    │   └── dataStore.demo.ts   # localStorage backend
    └── admin/
        ├── AdminApp.tsx
        ├── AdminLogin.tsx
        ├── AdminShell.tsx
        ├── adminAuth.ts
        ├── admin.css
        ├── components/
        │   ├── ConfirmModal.tsx
        │   ├── PromptModal.tsx
        │   ├── Toast.tsx
        │   └── UserEditModal.tsx
        └── sections/
            ├── Dashboard.tsx
            ├── Users.tsx
            ├── Transactions.tsx
            ├── Plans.tsx
            ├── Banks.tsx
            ├── Gifts.tsx
            └── Settings.tsx
```

## 🧪 End-to-end smoke test

1. Start the admin: `npm run dev` → http://localhost:5174 — log in with `44` / `a444`.
2. Start the user app: `cd ../alpha-trading && npm run dev` → http://localhost:5173.
3. Sign up a user in the user app.
4. In the admin, open **Users** — the new user appears.
5. Add 5000 ETB to their balance via the Edit User modal.
6. In the user app, refresh — the balance updates immediately.
7. In the admin, create a gift code `WELCOME100` with 100 ETB reward.
8. In the user app, redeem `WELCOME100` — balance increases by 100, the code disappears from the list.

That's the full happy-path verifying both halves talk to the same Firebase.

## 📜 License

Private — internal project.
