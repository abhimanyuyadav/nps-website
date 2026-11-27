"use client";
import {
  useConvex,
  useMutation,
  usePaginatedQuery,
  useQuery,
  type PaginatedQueryReference,
  type PaginationStatus,
} from "convex/react";
import {
  getFunctionName,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
  type PaginationOptions,
} from "convex/server";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";

type Tick = { version: string; paginationOpts?: PaginationOptions };
type Response<T> = { value: T } | { error: Error };
export function useArchiveRecords() {
  return useConvex().url === process.env.NEXT_PUBLIC_ARCHIVE_CONVEX_URL;
}
export async function archiveRequest<T>(body: object): Promise<T> {
  const response = await fetch("/admin/archive-access", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("The earlier school records could not be opened.");
  return response.json();
}

// A new access is recorded for each mount and whenever the server releases changed data.
function useReleased<T>(source: string, params: object | "skip", ticks: Tick[]) {
  const { userId, sessionId } = useAuth();
  const client = useConvex();
  const read = useMutation(api.recordAccess.read);
  const scope = JSON.stringify([client.url, userId, sessionId, source, params]);
  const archive = useArchiveRecords();
  const requests = JSON.stringify(ticks);
  const flight = useRef({ scope: "", cache: new Map<string, Promise<T>>() });
  const [resolved, setResolved] = useState({ scope: "", responses: new Map<string, Response<T>>() });
  useEffect(() => {
    let active = true;
    const [, , , name, args] = JSON.parse(scope);
    if (flight.current.scope !== scope) flight.current = { scope, cache: new Map() };
    const cache = flight.current.cache;
    if (args === "skip" || !sessionId) return;
    const wanted = (JSON.parse(requests) as Tick[]).map((tick) => JSON.stringify(tick));
    for (const key of cache.keys()) if (!wanted.includes(key)) cache.delete(key);
    const pending = wanted.map((key) => {
      let promise = cache.get(key);
      if (!promise) {
        const tick: Tick = JSON.parse(key);
        const request = {
          source: name,
          params: tick.paginationOpts ? { ...args, paginationOpts: tick.paginationOpts } : args,
        };
        promise = archive ? archiveRequest<T>({ operation: "read", ...request }) : read(request);
        cache.set(key, promise!);
      }
      return promise!;
    });
    void Promise.all(
      pending.map(async (promise, index) => {
        try {
          return [wanted[index], { value: await promise }] as const;
        } catch (error) {
          return [
            wanted[index],
            { error: error instanceof Error ? error : new Error("Could not load the school record.") },
          ] as const;
        }
      }),
    ).then((entries) => {
      if (active) setResolved({ scope, responses: new Map<string, Response<T>>(entries) });
    });
    return () => {
      active = false;
    };
  }, [archive, read, requests, scope, sessionId]);
  return ticks.map((tick) => {
    const response = resolved.scope === scope ? resolved.responses.get(JSON.stringify(tick)) : undefined;
    if (response && "error" in response) throw response.error;
    return response?.value;
  });
}

export function useRecordPages<Q extends PaginatedQueryReference>(
  ref: Q,
  params: Omit<FunctionArgs<Q>, "paginationOpts"> | "skip",
  options: { initialNumItems: number },
) {
  const source = getFunctionName(ref);
  const archive = useArchiveRecords();
  const archiveScope = JSON.stringify([source, params]);
  const [cursorState, setCursorState] = useState<{ scope: string; cursors: PaginationOptions[] }>({
    scope: "",
    cursors: [],
  });
  const cursors =
    cursorState.scope === archiveScope
      ? cursorState.cursors
      : [{ cursor: null, numItems: options.initialNumItems }];
  const pages = usePaginatedQuery(
    api.recordAccess.pageVersion,
    archive || params === "skip" ? "skip" : { source, params },
    options,
  );
  const ticks = archive
    ? params === "skip"
      ? []
      : cursors.map((paginationOpts) => ({ paginationOpts, version: "archive" }))
    : pages.results;
  const values = useReleased<FunctionReturnType<Q>>(source, params, ticks);
  if (archive) {
    const last = values.at(-1);
    const status: PaginationStatus = !last
      ? values.length > 1
        ? "LoadingMore"
        : "LoadingFirstPage"
      : last.isDone
        ? "Exhausted"
        : "CanLoadMore";
    return {
      results: values.flatMap((page) => page?.page ?? []) as FunctionReturnType<Q>["page"],
      status,
      loadMore: (numItems: number) => {
        if (last && !last.isDone)
          setCursorState({
            scope: archiveScope,
            cursors: [...cursors, { cursor: last.continueCursor, numItems }],
          });
      },
    };
  }
  return {
    ...pages,
    results: values.flatMap((page) => page?.page ?? []) as FunctionReturnType<Q>["page"],
    status: values.some((page) => page === undefined) ? ("LoadingFirstPage" as const) : pages.status,
  };
}

export function useRecordDetail<Q extends FunctionReference<"query">>(
  ref: Q,
  params: FunctionArgs<Q> | "skip",
): FunctionReturnType<Q> | undefined {
  const source = getFunctionName(ref);
  const archive = useArchiveRecords();
  const version = useQuery(
    api.recordAccess.detailVersion,
    archive || params === "skip" ? "skip" : { source, params },
  );
  const ticks = archive && params !== "skip" ? [{ version: "archive" }] : version ? [{ version }] : [];
  return useReleased<FunctionReturnType<Q>>(source, params, ticks)[0];
}
