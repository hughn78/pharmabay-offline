import { create } from "zustand";

interface ExportCartState {
  selectedIds: Set<string>;
  addProduct: (id: string) => void;
  removeProduct: (id: string) => void;
  toggleProduct: (id: string) => void;
  addMany: (ids: string[]) => void;
  removeMany: (ids: string[]) => void;
  clearAll: () => void;
  count: number;
}

export const useExportCart = create<ExportCartState>((set) => ({
  selectedIds: new Set<string>(),
  count: 0,
  addProduct: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      next.add(id);
      return { selectedIds: next, count: next.size };
    }),
  removeProduct: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      next.delete(id);
      return { selectedIds: next, count: next.size };
    }),
  toggleProduct: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      next.has(id) ? next.delete(id) : next.add(id);
      return { selectedIds: next, count: next.size };
    }),
  addMany: (ids) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      ids.forEach((id) => next.add(id));
      return { selectedIds: next, count: next.size };
    }),
  removeMany: (ids) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      ids.forEach((id) => next.delete(id));
      return { selectedIds: next, count: next.size };
    }),
  clearAll: () => set({ selectedIds: new Set(), count: 0 }),
}));
