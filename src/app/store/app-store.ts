import { create } from 'zustand';
import { DIRECTION_INPUT_ENABLED } from '@src/features/scouting/model/input-levels';
import type { MatchProject } from '@src/domain/match/types';
import { createEmptyMatchProject } from '@src/domain/match/factories';
import { normalizeMatchProject } from '@src/domain/match';

// The open match survives reloads: iPad Safari reloads background tabs, and
// scouting must pick up where it left off. Only the id is stored; the match
// itself is read back from IndexedDB.
const ACTIVE_PROJECT_ID_KEY = 'syncscout-live.activeProjectId';

export function readStoredActiveProjectId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_PROJECT_ID_KEY);
  } catch {
    return null;
  }
}

function storeActiveProjectId(id: string | null) {
  try {
    if (id) {
      window.localStorage.setItem(ACTIVE_PROJECT_ID_KEY, id);
    } else {
      window.localStorage.removeItem(ACTIVE_PROJECT_ID_KEY);
    }
  } catch {
    // Storage can be unavailable (private mode); the app still works without restore.
  }
}

// Display and input preferences, kept across reloads.
const PREFERENCES_KEY = 'syncscout-live.preferences';

/**
 * 'court': draw the ball on the court. 'tag': buttons only (player → evaluation).
 * 'basic': serve and point winner only, for rally-by-rally video.
 */
export type InputMode = 'court' | 'tag' | 'basic';

/** Teams recorded in tag input: one team (usually your own) or both. */
export type TagRecordTeams = 'home' | 'away' | 'both';

type Preferences = {
  showDebugSubzones: boolean;
  hideImportWarnings: boolean;
  toolbarScale: number;
  markerScale: number;
  confirmPointAssignment: boolean;
  simpleInput: boolean;
  inputMode: InputMode;
  feedbackSound: boolean;
  tagRecordTeams: TagRecordTeams;
};

const DEFAULT_PREFERENCES: Preferences = {
  showDebugSubzones: false,
  hideImportWarnings: false,
  toolbarScale: 1.4,
  markerScale: 1.5,
  confirmPointAssignment: true,
  // Large touch buttons, no DataVolley detail rows (ball type, blockers, calls).
  simpleInput: true,
  inputMode: 'tag',
  feedbackSound: true,
  // Most coaches record their own team; the home team is taken as "us".
  tagRecordTeams: 'home',
};

function loadPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    const preferences = raw ? { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<Preferences>) } : DEFAULT_PREFERENCES;
    // Court drawing is not offered (see DIRECTION_INPUT_ENABLED): a stored "court" choice becomes tags.
    return !DIRECTION_INPUT_ENABLED && preferences.inputMode === 'court'
      ? { ...preferences, inputMode: 'tag' }
      : preferences;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function savePreferences(state: Preferences) {
  try {
    const preferences: Preferences = {
      showDebugSubzones: state.showDebugSubzones,
      hideImportWarnings: state.hideImportWarnings,
      toolbarScale: state.toolbarScale,
      markerScale: state.markerScale,
      confirmPointAssignment: state.confirmPointAssignment,
      simpleInput: state.simpleInput,
      inputMode: state.inputMode,
      feedbackSound: state.feedbackSound,
      tagRecordTeams: state.tagRecordTeams,
    };
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences simply reset on the next reload when storage is unavailable.
  }
}

function cloneProject(project: MatchProject): MatchProject {
  if (typeof structuredClone === 'function') {
    return structuredClone(project);
  }

  return JSON.parse(JSON.stringify(project)) as MatchProject;
}

interface AppStoreState {
  activeProject: MatchProject | null;
  showDebugSubzones: boolean;
  hideImportWarnings: boolean;
  toolbarScale: number;
  markerScale: number;
  confirmPointAssignment: boolean;
  simpleInput: boolean;
  inputMode: InputMode;
  feedbackSound: boolean;
  tagRecordTeams: TagRecordTeams;
  createProject: () => void;
  setActiveProject: (project: MatchProject) => void;
  closeProject: () => void;
  setShowDebugSubzones: (value: boolean) => void;
  setHideImportWarnings: (value: boolean) => void;
  setToolbarScale: (value: number) => void;
  setMarkerScale: (value: number) => void;
  setConfirmPointAssignment: (value: boolean) => void;
  setSimpleInput: (value: boolean) => void;
  setInputMode: (value: InputMode) => void;
  setFeedbackSound: (value: boolean) => void;
  setTagRecordTeams: (value: TagRecordTeams) => void;
}

export const useAppStore = create<AppStoreState>((set, get) => {
  const setPreference = (patch: Partial<Preferences>) => {
    set(patch);
    savePreferences(get());
  };

  return {
  activeProject: null,
  ...loadPreferences(),
  createProject: () => {
    set({ activeProject: createEmptyMatchProject() });
  },
  setActiveProject: (project) => {
    storeActiveProjectId(project.metadata.id);
    set({ activeProject: cloneProject(normalizeMatchProject(project)) });
  },
  closeProject: () => {
    storeActiveProjectId(null);
    set({ activeProject: null });
  },
  setShowDebugSubzones: (value) => {
    setPreference({ showDebugSubzones: value });
  },
  setHideImportWarnings: (value) => {
    setPreference({ hideImportWarnings: value });
  },
  setToolbarScale: (value) => {
    setPreference({ toolbarScale: value });
  },
  setMarkerScale: (value) => {
    setPreference({ markerScale: value });
  },
  setConfirmPointAssignment: (value) => {
    setPreference({ confirmPointAssignment: value });
  },
  setSimpleInput: (value) => {
    setPreference({ simpleInput: value });
  },
  setInputMode: (value) => {
    setPreference({ inputMode: value });
  },
  setTagRecordTeams: (value) => {
    setPreference({ tagRecordTeams: value });
  },
  setFeedbackSound: (value) => {
    setPreference({ feedbackSound: value });
  },
  };
});
