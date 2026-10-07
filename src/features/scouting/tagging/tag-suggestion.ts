import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';

/**
 * Tag input: guesses who touches the ball next and with which skill, so a
 * typical rally is tagged with "player → evaluation" (serve: evaluation only).
 * The scout can always override the team, player or skill.
 */

export const TAG_SKILLS: SkillType[] = ['serve', 'receive', 'set', 'attack', 'block', 'dig', 'freeball', 'cover'];

const SKILL_LETTER: Partial<Record<SkillType, string>> = {
  serve: 'S',
  receive: 'R',
  set: 'E',
  attack: 'A',
  block: 'B',
  dig: 'D',
  freeball: 'F',
  cover: 'C',
};

export type TagSuggestion = {
  teamSide: TeamSide;
  skill: SkillType;
};

type RallyTouchLike = {
  teamSide: TeamSide;
  skill: SkillType;
};

function opposite(teamSide: TeamSide): TeamSide {
  return teamSide === 'home' ? 'away' : 'home';
}

export function suggestNextTag(input: {
  servingTeam: TeamSide | null;
  currentRallyTouches: RallyTouchLike[];
}): TagSuggestion | null {
  const last = input.currentRallyTouches.at(-1);
  if (!last) {
    return input.servingTeam ? { teamSide: input.servingTeam, skill: 'serve' } : null;
  }

  switch (last.skill) {
    case 'serve':
      return { teamSide: opposite(last.teamSide), skill: 'receive' };
    case 'receive':
    case 'dig':
    case 'freeball':
    case 'cover':
    case 'set':
      // Sets are optional in tag input: go straight to the attack.
      return { teamSide: last.teamSide, skill: 'attack' };
    case 'attack':
      return { teamSide: opposite(last.teamSide), skill: 'dig' };
    case 'block':
      // A block touch usually lands back on the attacking side.
      return { teamSide: opposite(last.teamSide), skill: 'dig' };
    default:
      return { teamSide: last.teamSide, skill: 'attack' };
  }
}

/**
 * DataVolley code for one tagged touch, e.g. "*07A#", or with the optional
 * details "*05EQK1#" (ball type Q, combination K1). Zones are never tagged.
 * The combinations offered (K1, K7 ...) are DataVolley setter calls, which
 * belong on the set row only: on an attack row they would read as an
 * attack combination that does not exist.
 */
export function buildTagCode(input: {
  teamSide: TeamSide;
  jerseyNumber: number;
  skill: SkillType;
  evaluation: SkillEvaluation;
  ballType?: string | null;
  combination?: string | null;
}): string {
  const team = input.teamSide === 'home' ? '*' : 'a';
  const jersey = String(input.jerseyNumber).padStart(2, '0');
  const combination = input.skill === 'set' ? input.combination ?? '' : '';
  return `${team}${jersey}${SKILL_LETTER[input.skill] ?? 'A'}${input.ballType ?? ''}${combination}${input.evaluation}`;
}
