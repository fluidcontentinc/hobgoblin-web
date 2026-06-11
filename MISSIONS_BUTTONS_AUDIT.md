# Missions Section — Button Audit (#1)

Audit only. No fixes applied here; each "ACTION" line below is a candidate follow-up ticket.
Scope: the kid Missions experience (`BrowseView` tabs, `MissionDetailView`) plus the never-mounted `LeaderboardView`.

Legend: routed? / handler does anything? / user feedback?

## BrowseView tabs (`components/BrowseView.tsx`)

- [Hunt tab] OK / yes (`setActiveTab('hunt')`) / yes (active underline + gold text). Renders `HuntMapView`.
- [Missions tab] OK / yes (`setActiveTab('missions')`) / yes (active underline). Renders mission list.
- [Menu tab] OK / yes (`setActiveTab('menu')`) / yes (active underline). Renders restaurant/menu list.
- [Mission card tap] OK / yes (`onNavigateToMission(item, index)` -> `App.handleNavigateToMission` -> `setSelectedMission`) / yes (opens `MissionDetailView`). Routed correctly.
- [Search input] OK / yes (filters missions by title/location) / yes (live list update).
- [Retry] (error state) OK / yes (`loadData`) / yes (reloads).

Note: `mainMissions` vs `bonusMissions` split keys off `restaurantId`, which `ApiMissionsRepository` never populates -> every mission renders under "Bonus". Not a button bug, but a visible grouping inconsistency. ACTION (separate ticket): either populate `restaurantId` or drop the Main/Bonus split.

## MissionDetailView (`components/MissionDetailView.tsx`) — post #10/#8

- [Back] OK / yes (`onBack` -> `handleBackFromMission` clears `selectedMission`) / yes (returns to list).
- [Claim Mission] OK / yes (NOW wired in #8 to `Repos.missions.claim` -> `POST /adventures/{id}/start`) / yes (alert + button flips to "Started" card). Previously DEAD (no-op); fixed in this batch.
- [Mark as Complete] REMOVED in this batch. It was a local-only no-op (never POSTed; completion is per-step proof on the Hunt map). Detail view is now a catalog + enroll surface; play happens on the map.
- [Steps list] Display only (not interactive here) — real steps now render. Tapping a step is intentionally a map-side action, not wired here.

## LeaderboardView (`components/LeaderboardView.tsx`)

- [Entire screen] NOT MOUTED anywhere (no import outside its own file). Its internal buttons (if any) are unreachable. ACTION (separate ticket): either wire it into the kid flow (e.g. a Missions/Hunt sub-tab) or delete the file.

## Summary of recommended follow-up tickets

1. Decide Main/Bonus grouping: populate `restaurantId` or remove the split in `BrowseView`.
2. `LeaderboardView`: mount it or delete it.
3. (Done in this batch) Claim wired to enroll; dead "Mark as Complete" removed.
