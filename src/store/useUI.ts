import { create } from 'zustand';

interface UIState {
  checkIn: { open: boolean; periodStart?: string; editId?: string };
  valuationOpen: boolean;
  chatOpen: boolean;
  openCheckIn(opts?: { periodStart?: string; editId?: string }): void;
  closeCheckIn(): void;
  setValuationOpen(v: boolean): void;
  setChatOpen(v: boolean): void;
}

export const useUI = create<UIState>((set) => ({
  checkIn: { open: false },
  valuationOpen: false,
  chatOpen: false,
  openCheckIn: (opts = {}) => set({ checkIn: { open: true, ...opts } }),
  closeCheckIn: () => set({ checkIn: { open: false } }),
  setValuationOpen: (v) => set({ valuationOpen: v }),
  setChatOpen: (v) => set({ chatOpen: v }),
}));
