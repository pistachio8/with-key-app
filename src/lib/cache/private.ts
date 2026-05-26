import "server-only";

import { cacheLife, cacheTag } from "next/cache";

export type ViewerCacheLife =
  | "default"
  | "seconds"
  | "minutes"
  | "hours"
  | "days"
  | "weeks"
  | "max"
  | {
      stale?: number;
      revalidate?: number;
      expire?: number;
    };

export type ViewerCacheTag<Args extends readonly unknown[]> =
  | string
  | readonly string[]
  | ((...args: Args) => string | readonly string[]);

export type ViewerCachedOptions<Args extends readonly unknown[]> = {
  tag: ViewerCacheTag<Args>;
  life: ViewerCacheLife;
};

export function viewerCached<Args extends readonly unknown[], Result>(
  read: (...args: Args) => Promise<Result>,
  options: ViewerCachedOptions<Args>,
): (...args: Args) => Promise<Result> {
  return async function readWithPrivateCache(...args: Args): Promise<Result> {
    "use cache: private";

    const resolvedTags = typeof options.tag === "function" ? options.tag(...args) : options.tag;
    const tags = Array.isArray(resolvedTags) ? resolvedTags : [resolvedTags];

    cacheTag(...tags);
    applyCacheLife(options.life);

    return read(...args);
  };
}

function applyCacheLife(life: ViewerCacheLife): void {
  switch (life) {
    case "default":
      cacheLife("default");
      return;
    case "seconds":
      cacheLife("seconds");
      return;
    case "minutes":
      cacheLife("minutes");
      return;
    case "hours":
      cacheLife("hours");
      return;
    case "days":
      cacheLife("days");
      return;
    case "weeks":
      cacheLife("weeks");
      return;
    case "max":
      cacheLife("max");
      return;
    default:
      cacheLife(life);
  }
}
