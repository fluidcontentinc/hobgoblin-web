/**
 * Admin UI design tokens.
 *
 * Single source of truth for colour, spacing, radius, and type scales used
 * across the admin shell. Replaces the dozens of ad-hoc `rgba(255,255,255,…)`
 * and hex literals that used to live inline in [AdminPortal.tsx](../AdminPortal.tsx).
 *
 * Values intentionally preserve the existing palette so this refactor is a
 * pure rename — visual output is unchanged. Subsequent slices may retune
 * individual tokens (e.g. tighter borders, softer accents) without having
 * to chase down every consumer.
 *
 * NOTE: React Native doesn't support CSS variables, so these are plain JS
 * values consumed via `colors.text.muted` etc. inside `StyleSheet.create`.
 */

export const colors = {
  surface: {
    /** Outermost root background. */
    base:     '#070707',
    /** Page header strip (slightly lifted from base). */
    sunken:   '#0a0a0a',
    /** Sidebar column. */
    sidebar:  '#0c0c0c',
    /** Edit-modal background — one step above raised. */
    overlay:  '#0f0f0f',
    /** Cards, panels, tables, dialogs. */
    raised:   '#111',
    /** Inputs, chips, badges, thumbnails. */
    inset:    '#1a1a1a',
    /** Barely-visible zebra striping on alternating table rows. */
    zebra:    'rgba(255,255,255,0.015)',
  },

  border: {
    /** Hairline between adjacent surfaces (sidebar, page header, table rows). */
    subtle:   '#1c1c1c',
    /** Slightly heavier border for dialogs / outlined cards. */
    muted:    '#222',
    /** Heaviest neutral border (archive button outline). */
    strong:   '#333',
    /** Almost invisible — used inside the asset edit modal header. */
    whisper:  'rgba(255,255,255,0.06)',
    /** Translucent — used for inputs / chips so they sit cleanly on any surface. */
    input:    'rgba(255,255,255,0.1)',
  },

  text: {
    primary:     '#ffffff',
    /** ~70% — readable but slightly de-emphasised body copy. */
    secondary:   'rgba(255,255,255,0.7)',
    /** ~60% — secondary body, draft badge text. */
    softer:      'rgba(255,255,255,0.6)',
    /** ~50% — info bar copy, meta cells. */
    muted:       'rgba(255,255,255,0.5)',
    /** ~45% — field labels, sidebar inactive labels, table meta. */
    subtle:      'rgba(255,255,255,0.45)',
    /** ~40% — table head labels. */
    faint:       'rgba(255,255,255,0.4)',
    /** ~35% — page subtitle, empty state copy. */
    dim:         'rgba(255,255,255,0.35)',
    /** ~30% — sign-out text, sub-row meta. */
    veryDim:     'rgba(255,255,255,0.3)',
    /** ~25% — upload hint, ghost thumb icon. */
    ghost:       'rgba(255,255,255,0.25)',
    /** ~20% — text-input placeholder. */
    placeholder: 'rgba(255,255,255,0.2)',
  },

  accent: {
    /** The Hobgoblin gold. Primary CTA fill, active nav, links. */
    gold:           '#C9943D',
    /** Soft gold wash — selected row in asset picker. */
    goldWashSoft:   'rgba(201,148,61,0.08)',
    /** Slightly stronger wash — active sidebar item, transmission tag. */
    goldWash:       'rgba(201,148,61,0.10)',
    /** Sidebar-active wash. */
    goldWashActive: 'rgba(201,148,61,0.12)',
    /** Selected chip / hover wash. */
    goldWashStrong: 'rgba(201,148,61,0.15)',
    /** Subtle gold border (edit-modal outline). */
    goldBorderSoft: 'rgba(201,148,61,0.25)',
    /** Asset preview portal outline. */
    goldBorder:     'rgba(201,148,61,0.35)',
  },

  status: {
    /** Active / live / success foreground. */
    successFg:  '#4caf50',
    /** Active badge background. */
    successBg:  '#2d6a3f',
    /** Toast success background. */
    toastSuccessBg: '#1F6E3B',
    /** Archived badge background. */
    archivedBg: '#333',
    /** Archived badge text. */
    archivedFg: '#666',
    /** Draft badge background. */
    draftBg:    'rgba(255,255,255,0.15)',
    /** Draft badge text. */
    draftFg:    'rgba(255,255,255,0.6)',
    /** Destructive link / delete text. */
    dangerFg:   '#c45c5c',
    /** Toast error background. */
    toastErrorBg: '#8B2C2C',
  },

  overlay: {
    /** Dialog backdrop. */
    backdrop:      'rgba(0,0,0,0.7)',
    /** Asset preview backdrop (heavier — content is full media). */
    backdropHeavy: 'rgba(0,0,0,0.88)',
  },
} as const;

// Design canon: square-ish corners (radius 4) everywhere — no pills.
// True circles (avatars, dots, swatches) size themselves via width/2 instead.
export const radii = {
  /** Tag / badge corner. */
  xs: 4,
  /** Chip corner. */
  sm: 4,
  /** Button / input corner. */
  md: 4,
  /** Card / panel / table corner. */
  lg: 4,
  /** Dialog corner. */
  xl: 4,
  /** Formerly full-round pill — flattened to match the hard-edge canon. */
  pill: 4,
} as const;

export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  14,   // table cell padding
  xl:  16,
  '2xl': 20, // page header vertical
  '3xl': 24, // dialog content padding
  '4xl': 28, // page content padding
} as const;

export const type = {
  size: {
    /** Eyebrow labels, badges. */
    eyebrow: 11,
    /** Small meta. */
    xs:      12,
    /** Sub-meta, hints, sub-row. */
    sm:      13,
    /** Default chip / select chip text. */
    chip:    14,
    /** Body meta, link text, button text. */
    md:      15,
    /** Default body / row title / input text. */
    base:    16,
    /** Field input large, dialog title. */
    lg:      17,
    /** Section heading. */
    xl:      19,
    /** Page title. */
    '2xl':   22,
  },
  weight: {
    regular: '400' as const,
    medium:  '500' as const,
    semi:    '600' as const,
    bold:    '700' as const,
    heavy:   '800' as const,
  },
  /** Letter-spacing scale for uppercase eyebrows and labels. */
  tracking: {
    label:   0.5,
    eyebrow: 1,
    logo:    3,
  },
} as const;

/** Fixed structural sizes shared across the shell. */
export const layout = {
  sidebarWidth: 200,
  topBarHeight: 44,
} as const;

/** Build / version info shown in the sidebar footer. */
export const buildInfo = {
  version: '0.1.0',
  channel: 'dev',
} as const;
