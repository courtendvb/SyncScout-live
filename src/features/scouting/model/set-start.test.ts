import { describe, expect, it } from 'vitest';
import type { Team } from '@src/domain/roster/types';
import { buildStartingLineup, createEmptySetStartSetupState, validateSetStartSetup } from './set-start';

function createTeam(id: string, jerseys: number[]): Team {
  return {
    id,
    code: id.toUpperCase(),
    name: id,
    players: jerseys.map((jerseyNumber) => ({
      id: `${id}-${jerseyNumber}`,
      jerseyNumber,
      firstName: '',
      lastName: '',
      shortName: `#${jerseyNumber}`,
      playerCode: `${id}-${jerseyNumber}`,
      isCaptain: false,
      isLibero: false,
    })),
    staff: { headCoach: '', assistantCoach: '' },
  };
}

describe('validateSetStartSetup', () => {
  it('lets a set start with no players in the lineup', () => {
    const state = { ...createEmptySetStartSetupState(), servingTeam: 'home' as const };
    const result = validateSetStartSetup(state, { home: createTeam('home', []), away: createTeam('away', []) });
    expect(result).toEqual({ isValid: true, homeIssues: [], awayIssues: [], generalIssues: [] });
  });

  it('lets a set start with some positions still empty', () => {
    const home = createTeam('home', [7, 3]);
    const state = { ...createEmptySetStartSetupState(), servingTeam: 'home' as const };
    state.home.slots[1] = 'home-7';
    state.home.slots[6] = 'home-3';
    expect(validateSetStartSetup(state, { home, away: createTeam('away', []) }).isValid).toBe(true);

    // Empty positions keep their role, so a player added later takes it over.
    const lineup = buildStartingLineup('home', state.home, home);
    expect(lineup.slots.map((slot) => slot.playerId)).toEqual(['home-7', '', '', '', '', 'home-3']);
    expect(lineup.slots.every((slot) => Boolean(slot.tacticalRole))).toBe(true);
  });

  it('still rejects the same player in two positions', () => {
    const home = createTeam('home', [7]);
    const state = { ...createEmptySetStartSetupState(), servingTeam: 'home' as const };
    state.home.slots[1] = 'home-7';
    state.home.slots[2] = 'home-7';
    expect(validateSetStartSetup(state, { home, away: createTeam('away', []) }).homeIssues).toContain('setSetupLineupDuplicatePlayers');
  });
});
