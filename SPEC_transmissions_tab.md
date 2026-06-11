# Spec — Admin Transmissions Tab
> Target file: `components/admin/AdminPortal.tsx` → `TransmissionsTab` component and its helpers.
> Do NOT touch any other tab, component, or file unless explicitly listed.

---

## 1. What a "transmission" is

A `NarrativeAsset` — a video, audio clip, or image the admin uploads. It gets attached to an adventure step and delivered to kids when that step unlocks.

### TypeScript interface (already defined in the file)

```ts
interface NarrativeAsset {
  id: number;
  type: 'video' | 'audio' | 'image';
  title: string;
  url: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  created_at: string;        // ISO 8601
  steps_count: number;       // how many steps use this asset
}
```

---

## 2. Backend API

All routes are under `auth:sanctum` + `X-App-Key` header. The `api` client in `src/api/client.ts` handles auth automatically.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/admin/narrative-assets` | List all assets, ordered newest first |
| `POST` | `/admin/narrative-assets` | Upload — **multipart** form, fields below |
| `PATCH` | `/admin/narrative-assets/{id}` | Update metadata only (no file swap) |
| `DELETE` | `/admin/narrative-assets/{id}` | Delete asset + removes file from storage |

### POST upload fields
- `file` — required, the media file (video/audio/image, max 200 MB)
- `title` — required string
- `thumbnail_url` — optional URL string (for video/audio previews)
- `duration_seconds` — optional integer

### PATCH fields
- `title` — optional string
- `thumbnail_url` — optional nullable URL string
- `duration_seconds` — optional nullable integer

### Response shape (all endpoints return this for a single asset)
```json
{
  "id": 12,
  "type": "video",
  "title": "Intro Clue #1",
  "url": "https://cdn.../file.mp4",
  "thumbnail_url": null,
  "duration_seconds": 90,
  "created_at": "2026-05-27T14:00:00+00:00",
  "steps_count": 2
}
```

The existing `adminApi` object in the file already has all four methods wired correctly:
```ts
getAssets:   () => api.get('/admin/narrative-assets')
uploadAsset: (fields) => api.postMultipart('/admin/narrative-assets', fields)
updateAsset: (id, body) => api.patch(`/admin/narrative-assets/${id}`, body)
deleteAsset: (id) => api.delete(`/admin/narrative-assets/${id}`)
```

---

## 3. TransmissionsTab component — full specification

### 3a. Page header
- Title: **"Transmissions"**
- Subtitle: "Video, audio and image assets delivered to kids at adventure steps"
- No button in the header (upload is in the panel below)

---

### 3b. Upload panel

A card (`uploadPanel` style) at the top of the scroll area with the heading **"Upload New Transmission"**.

Contains four inputs arranged in two rows, then the upload button:

**Row 1 — full width**
- `title` text input — placeholder: `"Title (e.g. Intro Clue #1)"` — **required**

**Row 2 — split**
- `thumbnail_url` text input (flex: 1) — placeholder: `"Thumbnail URL (optional — video/audio)"` — `autoCapitalize="none"`
- `duration_seconds` number input (fixed ~160 px) — placeholder: `"Duration (seconds)"` — `keyboardType="number-pad"`

**Upload button** — full width, gold, label `"Choose File & Upload"`, shows `ActivityIndicator` while uploading.

**Hint text** below button: `"Supports video, audio, and image files. Max 200 MB."`

**Upload flow:**
1. Validate `title` is non-empty; toast error if not.
2. Open native `<input type="file" accept="video/*,audio/*,image/*">`.
3. On file chosen: build `fields = { file, title }`, add `thumbnail_url` if non-empty, add `duration_seconds` (parsed int) if valid number.
4. Call `adminApi.uploadAsset(fields)`.
5. On success: prepend new asset to list, clear all three inputs, toast `"Transmission uploaded!"`.
6. On error: toast the error message.

---

### 3c. Library table

A table rendered below the upload panel. Columns:

| Column | Width | Content |
|--------|-------|---------|
| Thumbnail | 72 px | See §3c-i |
| Type | 90 px | Type badge (e.g. `VIDEO`) |
| Title | flex 1 | Title on line 1; truncated URL on line 2 (strip `https://`, max 50 chars + `…`) |
| Duration | 100 px | `"2m 30s"` format, or `"—"` if null |
| Added | 100 px | `created_at` formatted as `"May 27, 2026"` |
| Used in | 100 px | `"3 steps"` / `"1 step"` |
| Actions | 120 px | Edit · Delete links |

#### 3c-i. Thumbnail column

- If the asset has a previewable URL — use `asset.url` for `type === 'image'`, else `asset.thumbnail_url` — render a `52×40` rounded `Image` component.
  - Wrap in a `TouchableOpacity` that opens the **preview lightbox** (§3d).
- If there is no previewable URL, render a `52×40` placeholder box with the text `"VID"` / `"AUD"` / `"IMG"`, also tappable to open the lightbox.

#### Type badge

Small pill: gold background tint, gold text, e.g. `VIDEO` / `AUDIO` / `IMAGE`.

#### Edit / Delete links

- **Edit** (gold) → opens `AssetEditModal` (§3e)
- **Delete** (red) → `window.confirm` then `adminApi.deleteAsset`, remove from list, toast `"Deleted."`

---

### 3d. Preview lightbox (`AssetPreviewModal` + `AssetPreviewContent`)

**Critical constraint:** React Native Web registers its synthetic event system on the React root. This means even `ReactDOM.createPortal` nodes have pointer events intercepted — native `<video>` and `<audio>` controls receive no clicks.

**Solution (must not change this):** Mount a completely separate React fiber tree using `ReactDOM.createRoot(freshContainer)` where `freshContainer` is a `<div>` appended directly to `document.body`. This is the only escape from RN Web's event delegation.

**`AssetPreviewModal`** (rendered inside the RN tree, returns `null`):
- Uses a `ref` to hold the `onClose` callback so the isolated root never captures a stale closure.
- `useEffect` (dep: `asset`) creates the container, mounts `AssetPreviewContent` inside a fresh root, and cleans up (unmount + removeChild) on unmount or asset change.
- React 18 path: `require('react-dom/client').createRoot`. React 17 fallback: `require('react-dom').render`.

**`AssetPreviewContent`** (pure DOM React, no RN primitives):
- Fullscreen fixed overlay (`rgba(0,0,0,0.88)`), click-outside-to-close.
- Inner card: dark background, gold border, `maxWidth: 820`.
- Header row: asset title left, "Close" button right.
- Media area:
  - `type === 'image'` → `<img>` with `objectFit: contain`, max height 520 px.
  - `type === 'video'` → `<video controls>`, max height 480 px.
  - `type === 'audio'` → `<audio controls>` with padding.
  - On `onError`: show fallback with message `"This file cannot be previewed in the browser"` + `"Open file directly"` link (`target="_blank"`).

---

### 3e. Edit modal (`AssetEditModal`)

Standard RN `Modal` (not the isolated-root pattern — no media controls here, so RN interception is not an issue).

Layout inside a `dialogBoxWide` (`maxWidth: 700`) dialog:

**Top section — preview + metadata (side by side, `flexDirection: 'row'`, gap 20)**

Left: `100×100` rounded thumbnail.
- If `type === 'image'`: show `asset.url`.
- Else if `thumbnail_url` set: show it.
- Else: grey placeholder box with type text (`VIDEO` / `AUDIO` / `IMAGE`).

Right: metadata column with labelled rows:
- **Type** — type badge
- **Uploaded** — `created_at` formatted as `"May 27, 2026"`
- **Used in** — `"N steps"`
- **URL** — the raw URL in small grey text (2 lines max, `fontSize: 11, opacity: 0.5`)

**Divider** — 1 px horizontal rule.

**Editable fields:**
- `Title` — required text input
- `Duration (seconds)` — optional number input
- `Thumbnail URL` — optional URL input with hint: `"Used as the preview thumbnail in the table. Images use the file URL automatically."`

**Save button** — gold, `"Save Changes"`, shows spinner while saving.

**Save logic:**
1. Validate title non-empty.
2. Build `body = { title }`, add `thumbnail_url` (null if blank), add `duration_seconds` (null if blank/invalid).
3. `adminApi.updateAsset(asset.id, body)`.
4. On success: call `onSaved(updated)` to update the list in place, toast `"Transmission updated."`, close modal.

---

## 4. Styling rules

- Background palette: `#070707` root, `#0a0a0a` header, `#111` panels/table head, `#1a1a1a` inputs/rows.
- Gold accent: `#C9943D`.
- No emojis anywhere — not in labels, placeholders, icons, or comments.
- Use `StyleSheet.create` for all styles; no inline style objects except where RN StyleSheet cannot express a CSS property (e.g. `cursor: 'pointer'`, which uses `as any`).
- All text in the isolated lightbox uses inline `React.CSSProperties` objects (it is a plain DOM tree, not RN).

---

## 5. State summary for `TransmissionsTab`

```ts
const [assets, setAssets]               = useState<NarrativeAsset[]>([]);
const [loading, setLoading]             = useState(true);
const [uploading, setUploading]         = useState(false);
const [title, setTitle]                 = useState('');
const [uploadThumb, setUploadThumb]     = useState('');
const [uploadDuration, setUploadDuration] = useState('');
const [editingAsset, setEditingAsset]   = useState<NarrativeAsset | null>(null);
const [previewAsset, setPreviewAsset]   = useState<NarrativeAsset | null>(null);
```

---

## 6. What NOT to change

- `adminApi` object — all four methods are correct.
- `NarrativeAsset` interface — do not add or remove fields.
- Any component outside `TransmissionsTab`, `AssetEditModal`, `AssetPreviewModal`, `AssetPreviewContent`.
- The `AdventuresTab`, `StepFormModal`, `AdventureFormModal`, `AdventureDetail` components.
- The sidebar, `Dialog`, `Field`, `Select`, `StatusBadge` shared atoms.
- Any backend file.
