# Hobgoblin Hunt — Engineering Handoff
**Date:** May 26, 2026

---

## Project Overview

Hobgoblin Hunt is a scavenger-hunt platform for kids. Parents enroll kids, kids complete geo-tagged steps (landmarks, restaurants, clues), and a "Hobgoblin" character delivers video/audio/image transmissions when steps unlock. Restaurants are real storefronts that participate in the hunt. Drivers handle delivery orders placed through the app.

---

## Repositories

| Repo | Purpose | Local path |
|---|---|---|
| `marketplace-engine` | Laravel 11 API backend | `C:\Users\Stone\Herd\marketplace-engine` |
| `hobgoblins` | Letter Keepers reference app (transmission pattern) | `C:\Users\Stone\Herd\hobgoblins` |
| Frontend (Expo RN Web) | React Native Web app | `H:\Hobgoblin Hunt (Fluid copy)\07_ENGINEERING\frontend` |

**API base:** `https://api.ahomerun.net/api`
**Local API:** `https://marketplace-engine.test/api` (Herd)
**Frontend deploy:** GitHub Pages via `.\deploy.ps1 "commit message"`

---

## Architecture

### Auth
- Sanctum token auth. Every request needs `Authorization: Bearer <token>` and `X-App-Key` header.
- Roles (Spatie): `parent`, `restaurant`, `driver`, `kid`, `admin`
- Kids have no email/password — they get a one-time `HOB-XXXX` invite code from a parent, claim it, and receive a permanent Sanctum token stored on-device.
- Admin accounts use normal email/password login.

### Frontend routing (App.tsx)
`RootFlow` type determines which portal is shown after login:

| Role | Flow | Component |
|---|---|---|
| `parent` | `'parent'` | `ParentPortal` |
| `restaurant` | `'restaurant'` | `MerchantPortal` |
| `driver` | `'driver'` | `DriverPortal` |
| `kid` | `'kid'` | Kid home tabs |
| `admin` | `'admin'` | `AdminPortal` |
| Kid (no account) | `'kid-claim'` | `KidClaimView` |

### Key files

**Frontend**
- `App.tsx` — root router, boot auth check, role-to-flow mapping
- `src/api/client.ts` — all API calls
- `src/repositories/ApiAuthRepository.ts` — auth logic, role persistence
- `src/contracts/roles.ts` — `Role` type (must include all roles)
- `utils/auth.ts` — `AuthRole` type + AsyncStorage helpers
- `components/admin/AdminPortal.tsx` — full admin UI
- `components/parent/ParentPortal.tsx` — parent UI
- `components/merchant/MerchantPortal.tsx` — restaurant owner UI
- `components/driver/DriverPortal.tsx` — driver UI
- `components/auth/KidClaimView.tsx` — kid invite code entry screen
- `components/auth/EnterView.tsx` — role picker (has dim Admin button at bottom)

**Backend**
- `routes/api.php` — all routes
- `app/Http/Controllers/Admin/AdminAdventureController.php` — adventure CRUD
- `app/Http/Controllers/Admin/AdminStepController.php` — step CRUD + reorder
- `app/Http/Controllers/Admin/AdminNarrativeAssetController.php` — transmission upload
- `app/Http/Controllers/KidController.php` — kid registration via invite code
- `app/Http/Controllers/ParentApprovalController.php` — invite code generation, kid supervision

---

## Transmission System (Hobgoblin character content)

Admins upload videos, audio, or images ("transmissions") that get attached to adventure steps. When a kid completes a step and it is approved, the transmission fires.

**Flow:**
1. Admin uploads file via `POST /api/admin/narrative-assets` (multipart, fields: `file`, `title`)
2. File stored publicly on DigitalOcean Spaces (`spaces_public` disk)
3. `NarrativeAsset` record created with `{ id, type, title, url, thumbnail_url, duration_seconds }`
4. When creating/editing a step, set `narrative_asset_id` to attach a transmission
5. `KidProgressService` fires transmission delivery when step unlocks

**Asset types** auto-detected from MIME: `video`, `audio`, `image`
**Max upload size:** 200 MB

---

## Admin Portal (AdminPortal.tsx)

Three tabs: Adventures, Transmissions, Account.

**Adventures tab**
- List all adventures with status badge (draft / active / archived) and step count
- Create adventure: title, description, city, area, start/end dates
- Drill into adventure: see steps list, activate (requires at least one step), archive
- Add/edit/delete steps — each step has: type (landmark/restaurant/clue), requirement type (photo/qr/gps/codeword), points, lat/lng/radius, optional flag, and a transmission picker

**Transmissions tab**
- Upload panel: web file picker, title input, uploads to `/api/admin/narrative-assets`
- Asset library: all uploaded assets with type tag, title, created date, step usage count, delete button

**Account tab**
- Sign out (uses `window.confirm` on web)

---

## Parent / Kid Invite Flow

1. Parent taps "Add Kid" in ParentPortal KidsTab
2. Enters kid's name, taps Generate — calls `POST /api/parent/invite-code`
3. Backend creates a `HOB-XXXX` code in `kid_invite_codes` table (24hr expiry)
4. Code shown to parent to share with child
5. Kid opens app, taps Kid, enters code in `KidClaimView`
6. Backend (`POST /api/kid/claim-invite`) finds code, creates kid user, links to parent via `parent_kids` pivot (requires `app_id`, `parent_id`, `kid_id`), returns permanent token
7. Token stored on device, kid lands on home screen

---

## Known Gotchas

**Web vs Native**
- `Alert.alert` with multiple buttons does not work on web. Use `Platform.OS === 'web'` guard with `window.confirm` / `window.prompt`.
- `Clipboard` API differs: use `navigator.clipboard.writeText` on web.
- PowerShell: use `Get-Content <path> -Tail 50` not `tail`.

**Roles**
- `Role` type in `src/contracts/roles.ts` and `AuthRole` in `utils/auth.ts` must both include any role you add.
- `pickValidRole()` in `ApiAuthRepository.ts` has its own allowed list — keep it in sync.
- Controller-level role checks (e.g., `isParent()`) do not automatically pass for `admin`. Must explicitly check `hasRole('admin')` alongside.

**Database**
- `parent_kids` pivot requires `app_id` — pass it as the second argument to `attach()`: `->attach($kidId, ['app_id' => $app->id])`.
- Start MySQL in Herd before running migrations.

**Deployment**
- Backend: deploy via Laravel Forge, then SSH in and run `php artisan migrate`.
- Frontend: `.\deploy.ps1 "commit message"` from the frontend folder.

---

## Local Dev Setup

1. Open Herd, start MySQL and the `marketplace-engine` site
2. Navigate to `https://marketplace-engine.test` to confirm it's up
3. In the frontend folder: `npx expo start --web`
4. Admin login: `admin@hobgoblin.test` / `password` (local only)

---

## What's Done

- Full auth flow: register, login, logout, email verification, password reset
- Role-based portals: Parent, Merchant, Driver, Kid, Admin
- Kid invite code system end-to-end
- Adventure CRUD (admin): create, edit, activate, archive, delete
- Step CRUD (admin): add steps to adventures, reorder via drag, attach transmissions
- Transmission upload system: multipart upload to DO Spaces, asset library
- Parent supervision: view kids, view kid progress, approve/reject step completions
- Restaurant merchant portal: store info, hours, menu CRUD with images
- Orders, delivery jobs, reviews, conversations/messages, leaderboard

## What's Next / Not Yet Done

- Kid home screen: adventure map, step submission UI, transmission playback
- Transmission delivery trigger: confirm `KidProgressService` fires on completion approval
- Push notifications for step unlock / transmission arrival
- Production deployment and end-to-end testing with real Spaces credentials
- Parent portal: pending approval review UI (backend exists, frontend tab may need wiring)
- Remove or gate the Admin button on EnterView before public launch
