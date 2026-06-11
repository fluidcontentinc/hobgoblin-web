# Design Inconsistencies Audit (#2)

Audit only. Fixes are separate tickets. Canon is the KID VIEW, established from `components/HomeView.tsx`.

## Canon (kid view)

- Radius: sharp — `4` (cards/inputs), occasional `9` (pills/badges). NOT `10`/`12`.
- Backgrounds: `#000` root, `#0a0a0a` cards (some screens use `#18181b`/`#111` — off-canon).
- Red accent: `#E23B2E` (primary CTA / brand).
- Cream highlight: `#F6E3AE` (button text on red, highlights).
- Gold `#C9943D` is the OLD accent — still widespread; should migrate to red/cream.
- Headings/code: `fontFamily: 'serif'`.
- Labels: UPPERCASE with `letterSpacing: 3-4`.

## Decision on `components/admin/ui/tokens.ts`

The plan suggested updating `tokens.ts` to the kid canon as pass 1. Holding that as a
**fix ticket, not part of this audit**, because:

- `tokens.ts` is the ADMIN design system; recoloring it gold->red and retuning radii
  restyles the entire Admin portal in one shot (high blast radius, needs visual QA).
- Kid screens do NOT consume `tokens.ts` (they use inline hex), so editing it does not
  fix any kid inconsistency — it only changes admin.

Recommend a dedicated "Admin token retune" ticket with screenshots before/after.

## Findings by screen

### components/HomeView.tsx (reference / mostly canon)
- Uses `#E23B2E`, `#F6E3AE`, serif, radius 4/9 — canon.
- Minor: `borderColor: '#C9943D'` (gold) at line ~199 mixes the old accent into the canon screen. ACTION: move to red or cream.

### components/auth/KidClaimView.tsx — OFF CANON
- `borderRadius: 12` (lines 140, 160) -> should be 4/9.
- Primary button `backgroundColor: '#C9943D'` (line 159) -> should be `#E23B2E`.
- Accent text `#C9943D` (line 113) -> should be red/cream.

### components/MissionDetailView.tsx — OFF CANON (gold-era)
- Root `backgroundColor: '#18181b'` -> canon root is `#000` (cards `#0a0a0a`).
- Gold accents `#C9943D` (back link, points, started badge, claim button) -> migrate to red/cream.
- Radius 4 is fine.

### components/BrowseView.tsx — OFF CANON (gold-era)
- Root `#18181b`; cards `#27272a`/`#000`; active tab + accents `#C9943D`; spinner `#C9943D`.
- ACTION: align backgrounds to `#000`/`#0a0a0a`, accents to red/cream.

### components/merchant/MerchantPortal.tsx — MIXED
- Inputs `#1a1a1a`, radius `10`; CTA gold `#C9943D`; borders `rgba(255,255,255,0.1x)`.
- Merchant is a separate audience from kids; flag for a decision on whether merchant follows
  kid canon or keeps its own system. Do NOT blindly recolor.

### components/AccountView.tsx — CHECK
- Verify radii and accent usage against canon (gold present). ACTION: itemize in fix ticket.

## Recommended fix-ticket order

1. KidClaimView -> canon (radius 4/9, red CTA, cream/red text). Highest visibility, kid-facing.
2. MissionDetailView + BrowseView -> canon backgrounds + accents.
3. HomeView gold borderColor cleanup.
4. Admin `tokens.ts` retune (separate, high blast radius, needs visual QA).
5. Decide merchant design language before touching MerchantPortal.
