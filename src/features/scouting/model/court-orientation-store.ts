import { create } from 'zustand';
import type { ScoutingCourtOrientation } from '@src/domain/spatial';
import { LANDSCAPE_ONLY_INPUT } from './input-levels';

const STORAGE_KEY = 'openvolleyscout.courtOrientation';

function readStoredCourtOrientation(): ScoutingCourtOrientation | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY);
  return rawValue === 'vertical' || rawValue === 'horizontal' ? rawValue : null;
}

function writeStoredCourtOrientation(value: ScoutingCourtOrientation) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, value);
}

interface CourtOrientationState {
  orientation: ScoutingCourtOrientation;
  setOrientation: (value: ScoutingCourtOrientation) => void;
}

export const useCourtOrientationStore = create<CourtOrientationState>((set) => ({
  // Landscape-only input always uses the horizontal court.
  orientation: LANDSCAPE_ONLY_INPUT ? 'horizontal' : readStoredCourtOrientation() ?? 'horizontal',
  setOrientation: (value) => {
    set({ orientation: value });
    writeStoredCourtOrientation(value);
  },
}));
