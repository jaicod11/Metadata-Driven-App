// src/store/ui-store.ts
// Global UI state: sidebar, modals, toasts

import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  activeModal: string | null;
  modalData: Record<string, unknown>;
  openModal: (id: string, data?: Record<string, unknown>) => void;
  closeModal: () => void;

  /** Pending confirmation dialog */
  confirmDialog: {
    open: boolean;
    title: string;
    message: string;
    onConfirm: (() => void) | null;
  };
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
  closeConfirm: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  activeModal: null,
  modalData: {},
  openModal: (id, data = {}) => set({ activeModal: id, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: {} }),

  confirmDialog: { open: false, title: "", message: "", onConfirm: null },
  showConfirm: (title, message, onConfirm) =>
    set({ confirmDialog: { open: true, title, message, onConfirm } }),
  closeConfirm: () =>
    set({ confirmDialog: { open: false, title: "", message: "", onConfirm: null } }),
}));
