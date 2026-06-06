// src/store/app-store.ts
// Zustand store for active app state

import { create } from "zustand";
import { AppConfig } from "@/types/config.types";

interface AppState {
  /** Currently selected app id in the dashboard */
  selectedAppId: string | null;
  setSelectedAppId: (id: string | null) => void;

  /** Cached parsed configs keyed by appId */
  configCache: Record<string, AppConfig>;
  setConfig: (appId: string, config: AppConfig) => void;
  clearConfig: (appId: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedAppId: null,
  setSelectedAppId: (id) => set({ selectedAppId: id }),

  configCache: {},
  setConfig: (appId, config) =>
    set((state) => ({
      configCache: { ...state.configCache, [appId]: config },
    })),
  clearConfig: (appId) =>
    set((state) => {
      const next = { ...state.configCache };
      delete next[appId];
      return { configCache: next };
    }),
}));
