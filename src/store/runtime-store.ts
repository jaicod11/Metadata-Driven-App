// src/store/runtime-store.ts
// Tracks loading/error state for runtime entity fetches

import { create } from "zustand";
import { EntityRecord } from "@/types/runtime.types";

type FetchKey = string; // `${appId}:${entity}`

interface RuntimeState {
  loading: Set<FetchKey>;
  errors: Record<FetchKey, string>;
  /** Optimistic cache — keyed by `${appId}:${entity}:${recordId}` */
  recordCache: Record<string, EntityRecord>;

  setLoading: (key: FetchKey, value: boolean) => void;
  setError: (key: FetchKey, msg: string | null) => void;
  cacheRecord: (appId: string, entity: string, record: EntityRecord) => void;
  removeRecord: (appId: string, entity: string, id: string) => void;
}

export const useRuntimeStore = create<RuntimeState>((set) => ({
  loading: new Set(),
  errors: {},
  recordCache: {},

  setLoading: (key, value) =>
    set((state) => {
      const next = new Set(state.loading);
      if (value) next.add(key);
      else next.delete(key);
      return { loading: next };
    }),

  setError: (key, msg) =>
    set((state) => {
      const next = { ...state.errors };
      if (msg) next[key] = msg;
      else delete next[key];
      return { errors: next };
    }),

  cacheRecord: (appId, entity, record) =>
    set((state) => ({
      recordCache: {
        ...state.recordCache,
        [`${appId}:${entity}:${record.id}`]: record,
      },
    })),

  removeRecord: (appId, entity, id) =>
    set((state) => {
      const next = { ...state.recordCache };
      delete next[`${appId}:${entity}:${id}`];
      return { recordCache: next };
    }),
}));
