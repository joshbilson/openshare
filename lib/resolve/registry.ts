/**
 * Adapter registry helpers: pick the right source adapter for a URL and the set
 * of destination adapters to resolve onto (every platform except the source).
 */

import type { AdapterBundle } from "../adapters/types";
import type { DestinationSearch, SourceAdapter } from "../contract/adapter";
import type { Platform } from "../contract/types";

export function findSource(
  bundles: readonly AdapterBundle[],
  url: string,
): SourceAdapter | null {
  for (const bundle of bundles) {
    if (bundle.source && bundle.source.matchesUrl(url)) return bundle.source;
  }
  return null;
}

export function selectDestinations(
  bundles: readonly AdapterBundle[],
  source: Platform,
): DestinationSearch[] {
  return bundles
    .filter((bundle) => bundle.platform !== source)
    .map((bundle) => bundle.destination);
}
