/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as cache from "../cache.js";
import type * as crons from "../crons.js";
import type * as events from "../events.js";
import type * as http from "../http.js";
import type * as lib_adapters from "../lib/adapters.js";
import type * as lib_env from "../lib/env.js";
import type * as maintenance from "../maintenance.js";
import type * as matching from "../matching.js";
import type * as playlists from "../playlists.js";
import type * as resolutions from "../resolutions.js";
import type * as share from "../share.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  cache: typeof cache;
  crons: typeof crons;
  events: typeof events;
  http: typeof http;
  "lib/adapters": typeof lib_adapters;
  "lib/env": typeof lib_env;
  maintenance: typeof maintenance;
  matching: typeof matching;
  playlists: typeof playlists;
  resolutions: typeof resolutions;
  share: typeof share;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
