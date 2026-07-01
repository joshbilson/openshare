import type { Platform } from "../contract/types";
import type { DestinationSearch, SourceAdapter } from "../contract/adapter";

/** A platform's reading (source) + matching (destination) capabilities. */
export interface AdapterBundle {
  platform: Platform;
  /** Reads playlists from this platform (no login). Null if reading is unsupported. */
  source: SourceAdapter | null;
  /** Resolves tracks onto this platform via the matching engine. */
  destination: DestinationSearch;
}
