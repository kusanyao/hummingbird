import { create } from "zustand";

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "success" | "error";
}

interface UIState {
  sidebarView: "collections" | "history";
  envDialogOpen: boolean;
  settingsOpen: boolean;
  saveDialogTabId: string | null;
  toasts: Toast[];
  setSidebarView: (view: "collections" | "history") => void;
  setEnvDialogOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setSaveDialogTabId: (id: string | null) => void;
  notify: (message: string, kind?: Toast["kind"]) => void;
  dismiss: (id: number) => void;
}

let nextToastId = 1;

export const useUI = create<UIState>()((set, get) => ({
  sidebarView: "collections",
  envDialogOpen: false,
  settingsOpen: false,
  saveDialogTabId: null,
  toasts: [],

  setSidebarView: (sidebarView) => set({ sidebarView }),
  setEnvDialogOpen: (envDialogOpen) => set({ envDialogOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setSaveDialogTabId: (saveDialogTabId) => set({ saveDialogTabId }),

  notify: (message, kind = "info") => {
    const id = nextToastId++;
    set({ toasts: [...get().toasts, { id, message, kind }] });
    window.setTimeout(() => {
      set({ toasts: get().toasts.filter((toast) => toast.id !== id) });
    }, 3200);
  },

  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
}));
