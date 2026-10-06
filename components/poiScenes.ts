import type { ImageSourcePropType } from 'react-native';

/**
 * Spooky POI close-up scenes, bundled in assets/poi/. Keyed by a stable slug.
 * Step nodes are matched to a scene by keyword on their title (resolveScene),
 * since backend step titles are admin-authored free text.
 */
const SCENES: Record<string, ImageSourcePropType> = {
  'pleasant-home': require('../assets/poi/pleasant-home.png'),
  'bronze-sculpture': require('../assets/poi/bronze-sculpture.png'),
  'austin-gardens': require('../assets/poi/austin-gardens.png'),
  'scoville-park': require('../assets/poi/scoville-park.png'),
  'taylor-park': require('../assets/poi/taylor-park.png'),
  'oprf-museum': require('../assets/poi/oprf-museum.png'),
  'amerikas': require('../assets/poi/amerikas.png'),
  'spilt-milk': require('../assets/poi/spilt-milk.png'),
  'georges': require('../assets/poi/georges-close-up.png'),
  'rustico': require('../assets/poi/rustico-close-up.png'),
};

// Ordered keyword → scene slug rules. First match wins, so more specific
// keywords should come before generic ones.
const KEYWORD_RULES: ReadonlyArray<{ match: (t: string) => boolean; slug: string }> = [
  { match: (t) => t.includes('pleasant') || t.includes('pleasent'), slug: 'pleasant-home' },
  { match: (t) => t.includes('bronze') || t.includes('sculpture'), slug: 'bronze-sculpture' },
  { match: (t) => t.includes('austin'), slug: 'austin-gardens' },
  { match: (t) => t.includes('scoville'), slug: 'scoville-park' },
  { match: (t) => t.includes('taylor'), slug: 'taylor-park' },
  { match: (t) => t.includes('museum') || t.includes('oprf') || t.includes('history'), slug: 'oprf-museum' },
  { match: (t) => t.includes('amerika'), slug: 'amerikas' },
  { match: (t) => t.includes('spilt') || t.includes('milk'), slug: 'spilt-milk' },
  { match: (t) => t.includes('george'), slug: 'georges' },
  { match: (t) => t.includes('rustico'), slug: 'rustico' },
];

/**
 * Resolve the spooky close-up scene for a step title, or null if none matches.
 * Matching is case-insensitive and keyword-based.
 */
export function resolveScene(title?: string | null): ImageSourcePropType | null {
  if (!title) return null;
  const t = title.toLowerCase();
  const rule = KEYWORD_RULES.find((r) => r.match(t));
  return rule ? SCENES[rule.slug] : null;
}

export default resolveScene;
