# Routing & Wiring Audit — Hobgoblin Hunt frontend

Date: June 5, 2026
Scope: `07_ENGINEERING/frontend` (Expo app) cross-checked against the
`marketplace-engine` API (`routes/api.php`, 2026-06-05). Covers (1) screen
reachability, (2) frontend API calls vs. backend routes, (3) design
consistency. Audit only — no fixes applied except the two requested edits
(dashed-line removal in `HuntMapView.tsx`, privacy policy copy).

Legend: 🔴 broken / blocks a flow · 🟡 works but worth fixing · 🟢 OK · ℹ️ info

---

## 1. Headline issues

### 🔴 Driver role is not wired to a backend (crashes on login)
- `App.tsx` routes the `driver` role to `DriverPortal`.
- `DriverPortal` → `DriverActions` (`src/usecases/driver.ts`), whose every
  method calls `Repos.driver.*`.
- `src/usecases/repos.ts` sets `driver: null` with `// TODO: Add
  ApiDriverRepository when driver backend is built`.
- Result: as soon as the portal calls `DriverActions.getState()` it throws
  `Cannot read properties of null`. The driver flow has no working screen.
- The backend is *ahead* of the client here — `/jobs`, `/jobs/{job}/accept`,
  `/jobs/{job}/complete` already exist. The gap is a missing
  `ApiDriverRepository` + wiring in `repos.ts`.
- **Action:** build `ApiDriverRepository` against the `/jobs` routes and set
  `Repos.driver`, OR gate the `driver` role out of `EnterView`/login until it's
  ready so no one can reach a dead portal.

---

## 2. Screen reachability (navigation)

`App.tsx` is a state router: `rootFlow` (auth/role) → role portal, and for the
kid flow `currentView` → tab, with detail views layered on top.

🟢 Reachable and correctly wired:
- Auth: Enter → Login / Register → VerifyEmail → role home; Kid claim flow;
  UnknownRole fallback. All transitions present.
- Kid tabs via `BottomNavigation`: Home, Browse (Hunt / Missions / Menu),
  Inbox, Orders, Account.
- Kid detail views: Mission, Order, Restaurant, MenuItem — each has open +
  back handlers.
- Hunt map: `HuntMapView` → `StepDetailModal` + `SnackStartModal`.
- Account → Privacy, Terms, Help/FAQ.
- Portals: Merchant, Parent, Admin all mount and navigate internally.

🟡 Orphaned components (defined, never mounted — dead code):
- `components/LeaderboardView.tsx` — never imported anywhere. Backend
  `/adventures/{id}/leaderboard` and a `leaderboard` usecase exist, so the data
  path is ready; the screen just isn't placed. **Action:** mount it (e.g. a
  Hunt/Missions sub-tab) or delete. (Already noted in `MISSIONS_BUTTONS_AUDIT.md`.)
- `components/common/AdventureMapCanvas.tsx` — never imported; superseded by
  `HuntMapView`. **Action:** delete to avoid confusion.

---

## 3. API calls vs. backend routes

Every endpoint the client calls was matched against `routes/api.php`.

🟢 Confirmed matched (client → backend):
- Auth: `/auth/register`, `/auth/login`, `/auth/logout`, `/email/verify/resend`.
- Account: `/me` (GET/PATCH).
- Browse: `/restaurants`, `/restaurants/{id}`.
- Orders: `/orders`, `/orders/{id}`, `/orders/{id}/status`.
- Adventures: `/adventures`, `/adventures/active`, `/adventures/{id}`,
  `/adventures/{id}/map`, `/adventures/{id}/leaderboard`,
  `/adventures/{id}/start|pause|resume|abandon`,
  `/adventures/steps/{step}/submit`, `/proof-assets`.
- Missions: `/missions`.
- Path of Power: `/path-map` (kid read), `/admin/path-map` +
  `/admin/path-map/images` (admin write).
- Kid inbox: `/kid/inbox`, `/kid/inbox/{id}/read`; `/kid/claim-invite`.
- Parent: `/parent/invite-codes` (+ `/{code}` delete), `/parent/kids`,
  `/parent/kids/{kid}/progress`, `/parent/pending-completions`,
  `/parent/completions/{id}/approve|reject`.
- Merchant: `/merchant/store` (+ `/logo`), `/merchant/hours`,
  `/merchant/menu` (+ `/{id}`, `/{id}/availability`, `/{id}/image`).
- Admin: `/admin/adventures` (+ steps, activate, archive),
  `/admin/narrative-assets` (+ broadcast).

🟡 `GET /kid/inbox/unread-count` — called by `App.tsx` for the home badge but
**not defined** in `routes/api.php`. It 404s and silently falls back to the
heavier `GET /kid/inbox`. Works, but the primary path is dead. **Action:** add
the lightweight route on the backend, or drop the call and rely on the fallback.

🟢 Not bugs (verified intentional):
- `/merchant/orders` and `/merchant/settings` are **internal nav paths**, not
  API calls — confirmed by `ApiMerchantRepository.ts`'s own comment that the
  engine has no `/merchant/orders` and merchants read the generic `/orders`.

ℹ️ Backend routes with no client consumer yet (engine surface ahead of the app —
not errors, just unused): `/admin/users`, `/admin/orders`, `/admin/revenue`,
`/admin/settings`; `/categories`, `/listings`, `/reviews`, `/conversations`
(+messages), `/notifications/preferences`, `/events`, `/media`, `/profiles`,
payments (`/payments/intent`, `/payouts/{user}`, `/refunds/{order}`,
`/stripe/connect/...`). Track these so the client can adopt them later.

---

## 4. Design consistency

The standing `DESIGN_AUDIT.md` is current and accurate; summary + one addition:

- Canon = kid view: root `#000`, cards `#0a0a0a`, primary red `#E23B2E`, cream
  `#F6E3AE`, radius 4/9, serif headings, UPPERCASE labels. Gold `#C9943D` is the
  legacy accent to migrate.
- Off-canon (gold-era), per existing audit: `KidClaimView`,
  `MissionDetailView`, `BrowseView` (use `#18181b` roots / gold accents);
  `MerchantPortal` mixed; minor gold border on `HomeView`.
- ➕ `HuntMapView.tsx` (not in the prior audit): map chrome uses `#18181b`/`#000`
  and gold `#C9943D` for zoom controls + step nodes (node colour also comes from
  the mission's own `color`). Consistent with the other gold-era screens; fold
  into the same red/cream migration if/when the map is restyled.

---

## 5. Recommended order of work

1. 🔴 Driver: build `ApiDriverRepository` + wire `Repos.driver`, or hide the
   driver role from login until it exists.
2. 🟡 `/kid/inbox/unread-count`: add the backend route (cheap) or remove the call.
3. 🟡 `LeaderboardView`: mount or delete. Delete `AdventureMapCanvas`.
4. 🟢 Design migration (separate visual-QA tickets): KidClaimView →
   MissionDetailView/BrowseView → HuntMapView/HomeView gold cleanup → admin
   `tokens.ts` retune → merchant design decision.
