"use client";
import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Item } from "@/lib/dataset";
import { api, ApiError, type Actor } from "@/lib/api";

type Pending = { item: Item; actor: Actor };
type Conflict = { key: string; current: Item };
export function useDurableWorkspace(
  setItems: Dispatch<SetStateAction<Item[]>>,
) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "saved" | "pending" | "saving" | "error"
  >("saved");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const wid = useRef<string | null>(null),
    versions = useRef(new Map<string, number>());
  const queue = useRef(new Map<string, Pending>()),
    running = useRef<Promise<void> | null>(null),
    blocked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const work = useRef<() => Promise<void>>(async () => {});
  function begin(id: string, items: Item[]) {
    if (queue.current.size)
      throw new Error(
        "Save or resolve pending edits before switching datasets.",
      );
    wid.current = id;
    versions.current = new Map(items.map((i) => [i.key, i.version!]));
    setWorkspaceId(id);
    blocked.current = false;
    setConflict(null);
    setError(null);
    setStatus("saved");
  }
  function end() {
    if (queue.current.size)
      throw new Error("Pending edits must be saved first.");
    wid.current = null;
    setWorkspaceId(null);
    versions.current.clear();
    setError(null);
    setConflict(null);
    setStatus("saved");
  }
  async function pump() {
    if (running.current) return running.current;
    if (blocked.current)
      throw new Error("Resolve the save error before continuing.");
    if (!wid.current || !queue.current.size) return;
    const id = wid.current;
    const job = (async () => {
      setStatus("saving");
      while (queue.current.size) {
        const [key, pending] = queue.current.entries().next().value!;
        const version = versions.current.get(key);
        try {
          const saved = await api<Item>(
            `/workspaces/${id}/items/${pending.item.id}`,
            {
              method: "PUT",
              body: JSON.stringify({
                data: pending.item.data,
                deleted: pending.item.deleted,
                version,
                actor: pending.actor,
              }),
            },
          );
          versions.current.set(key, saved.version!);
          const noNewer = queue.current.get(key) === pending;
          if (noNewer) queue.current.delete(key);
          setItems((items) =>
            items.map((i) =>
              i.key === key
                ? noNewer
                  ? { ...i, ...saved }
                  : { ...i, version: saved.version }
                : i,
            ),
          );
          setPendingCount(queue.current.size);
        } catch (e) {
          blocked.current = true;
          setStatus("error");
          setError((e as Error).message);
          if (
            e instanceof ApiError &&
            e.status === 409 &&
            (e.details as { current?: Item })?.current
          )
            setConflict({
              key,
              current: (e.details as { current: Item }).current,
            });
          throw e;
        }
      }
      setStatus("saved");
      setError(null);
    })();
    running.current = job;
    try {
      await job;
    } finally {
      running.current = null;
    }
  }
  work.current = pump;
  function stage(item: Item, actor: Actor) {
    if (!wid.current || !item.id) return;
    queue.current.set(item.key, {
      item: structuredClone(item),
      actor: { ...actor },
    });
    setPendingCount(queue.current.size);
    if (!blocked.current) {
      setStatus("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void work.current().catch(() => {});
      }, 500);
    }
  }
  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    if (running.current) await running.current;
    await work.current();
    if (queue.current.size) throw new Error("Some edits have not been saved.");
  }
  async function retry() {
    blocked.current = false;
    setError(null);
    await work.current();
  }
  async function resolve(keepDraft: boolean) {
    if (!conflict) return;
    const latest = await api<Item>(
      `/workspaces/${wid.current}/items/${conflict.current.id}`,
    );
    versions.current.set(conflict.key, latest.version!);
    if (!keepDraft) {
      queue.current.delete(conflict.key);
      setPendingCount(queue.current.size);
      setItems((items) =>
        items.map((i) => (i.key === conflict.key ? latest : i)),
      );
    }
    setConflict(null);
    blocked.current = false;
    setError(null);
    setStatus(queue.current.size ? "pending" : "saved");
    await work.current();
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return {
    workspaceId,
    status,
    error,
    conflict,
    pendingCount,
    begin,
    end,
    stage,
    flush,
    retry,
    resolve,
  };
}
