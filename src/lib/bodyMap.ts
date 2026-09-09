import { isBodyMaps, read } from './storage';

/**
 * The body map, read back by the games that use it.
 *
 * Body Heat Map produces it; Kinky Cards consumes it. That is the point of
 * having built the map at all: without something reading it back, it is a
 * picture you look at once. With it, playing the map once quietly improves
 * every later hand of Kinky Cards, and anywhere either of you marked as not
 * here stops appearing.
 *
 * Matching is by the words rather than by an id, because the two decks are
 * authored separately and a shared id scheme between them would be a silent
 * coupling that breaks the first time someone renames a slot option. A label
 * that does not appear on the map is simply left alone.
 */

const KEY = 'bodymap.body-heat-map';

/** Regions either of you marked as somewhere they do not want touched. */
export function excludedParts(): Set<string> {
  const maps = read<{ a: Record<string, number>; b: Record<string, number> } | null>(
    KEY,
    null,
    isBodyMaps,
  );
  if (!maps) return new Set();

  const out = new Set<string>();
  for (const side of [maps.a, maps.b]) {
    for (const [region, value] of Object.entries(side)) {
      if (value === 0) out.add(region);
    }
  }
  return out;
}

/**
 * True when a slot option names a region one of you ruled out.
 *
 * Compared loosely on purpose: "Inner thighs" on the map should exclude "Inner
 * thighs" in a deck whether or not the casing or a trailing word matches.
 */
export function ruledOut(label: string, excluded: Set<string>, labels: Map<string, string>): boolean {
  const want = label.trim().toLowerCase();
  for (const id of excluded) {
    const mapped = (labels.get(id) ?? id).trim().toLowerCase();
    if (mapped === want) return true;
  }
  return false;
}
