import { useEffect, useState } from 'react';
import type { CourtPosition, SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Player, Team } from '@src/domain/roster/types';
import type { BallTouch, NumBlockers } from '@src/domain/touch/types';
import { hasPlayerName } from '@src/domain/roster/helpers';
import { useTranslation, type TranslationKey } from '@src/i18n';
import type { PendingTouch } from '../model';
import { getEvaluationsForSkill } from '../model';
import { getBallTypeOptionsForSkill } from '../model/datavolley-ball-types';
import { resolveRallyOutcomeFromTouch } from '../model/scoring-rules';
import { getRallyEndReasonKey } from '../model/rally-end-reason';
import { parseDataVolleyInput } from '../expert/code-parser';
import { buildPendingTouchesFromParsed, formatDataVolleyTime } from '../expert/pending-touch-builder';
import { getSkillTranslationKey } from '../components/LiveScoutingToolbar';
import { TAG_SKILLS, buildTagCode, suggestNextTag } from './tag-suggestion';
import './tag-input-panel.css';

// Worst to best; "!" sits between "-" and "+".
const EVALUATION_ORDER: SkillEvaluation[] = ['=', '/', '-', '!', '+', '#'];
const EVAL_SUFFIX: Record<SkillEvaluation, string> = { '#': 'Hash', '+': 'Plus', '!': 'Excl', '-': 'Minus', '/': 'Slash', '=': 'Equal' };
const SKILLS_WITH_OWN_SHORT_LABELS: SkillType[] = ['serve', 'receive', 'attack', 'block'];
const BLOCKER_OPTIONS: NumBlockers[] = [0, 1, 2, 3, 4];
const COMBINATION_OPTIONS = ['K1', 'K2', 'K7', 'KC', 'KM'] as const;
const COMMON_JERSEYS = Array.from({ length: 30 }, (_, index) => index + 1);
const MORE_JERSEYS = Array.from({ length: 69 }, (_, index) => index + 31);

type CourtSide = 'left' | 'right' | 'top' | 'bottom';

/**
 * Positions of one team's half as drawn, row by row, so the players stand
 * where they are on court (front row at the net) and move as the team rotates.
 */
const HALF_LAYOUT: Record<CourtSide, CourtPosition[][]> = {
  left: [[5, 4], [6, 3], [1, 2]],
  right: [[2, 1], [3, 6], [4, 5]],
  top: [[1, 6, 5], [2, 3, 4]],
  bottom: [[4, 3, 2], [5, 6, 1]],
};

function evalShortLabelKey(skill: SkillType, evaluation: SkillEvaluation): TranslationKey {
  const group = SKILLS_WITH_OWN_SHORT_LABELS.includes(skill) ? skill : 'generic';
  return `evalShort${group.charAt(0).toUpperCase()}${group.slice(1)}${EVAL_SUFFIX[evaluation]}` as TranslationKey;
}

type PendingPoint = { teamSide: TeamSide; reason: string };
/** Jersey picker target: an empty position, or any player of the team (position null). */
type PickerTarget = { teamSide: TeamSide; position: CourtPosition | null };

interface TagInputPanelProps {
  homeTeam: Team;
  awayTeam: Team;
  homeLineup: ActiveLineup | null;
  awayLineup: ActiveLineup | null;
  servingTeam: TeamSide | null;
  currentRallyTouches: BallTouch[];
  leftTeamSide: TeamSide;
  rightTeamSide: TeamSide;
  /** Vertical court: the right-hand team is drawn on top, the left-hand one at the bottom. */
  vertical?: boolean;
  /** Ask before a tag ends the rally (the app's "require point confirmation" setting). */
  confirmPoint: boolean;
  onCommitTouches: (touches: PendingTouch[]) => void;
  onFinalizeRally: (teamSide: TeamSide, reason?: string) => void;
  onUndo: () => void;
  canUndo: boolean;
  /** Records a substitution before the current rally; false when it is not allowed. */
  onSubstitute: (teamSide: TeamSide, playerOutId: string, playerInId: string) => boolean;
  /**
   * A jersey number picked from the number grid: adds the player to the team when
   * new and, with a position, puts them in that empty lineup position. Resolves to
   * the player's id, or null when it could not be done.
   */
  onAssignJersey: (teamSide: TeamSide, jerseyNumber: number, position: CourtPosition | null) => Promise<string | null>;
}

/**
 * Button-based tagging on a court: tap a player (both teams stand in their
 * current rotation), then the skill if it differs from the suggestion, optional
 * details (ball type, blockers, combination) and the evaluation. No directions.
 * The next team and skill are guessed from the rally; deciding tags award the
 * point. Touches take the video position when the video panel is open.
 */
export function TagInputPanel({
  homeTeam,
  awayTeam,
  homeLineup,
  awayLineup,
  servingTeam,
  currentRallyTouches,
  leftTeamSide,
  rightTeamSide,
  vertical = false,
  confirmPoint,
  onCommitTouches,
  onFinalizeRally,
  onUndo,
  canUndo,
  onSubstitute,
  onAssignJersey,
}: TagInputPanelProps) {
  const { t } = useTranslation();
  const suggestion = suggestNextTag({ servingTeam, currentRallyTouches });
  const [teamOverride, setTeamOverride] = useState<TeamSide | null>(null);
  const [skillOverride, setSkillOverride] = useState<SkillType | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [ballType, setBallType] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<NumBlockers | null>(null);
  const [combination, setCombination] = useState<string | null>(null);
  const [pendingPoint, setPendingPoint] = useState<PendingPoint | null>(null);
  // A bench player was tagged: ask whom they replaced before recording the tag.
  const [pendingSubstitution, setPendingSubstitution] = useState<{ evaluation: SkillEvaluation } | null>(null);
  const [substitutionError, setSubstitutionError] = useState(false);
  // Jersey picker: opened from an empty position or a team's bench button, and on
  // its own for the server while position 1 is still empty.
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickerDismissed, setPickerDismissed] = useState(false);
  const [showMoreJerseys, setShowMoreJerseys] = useState(false);
  const [jerseyAwaitingPosition, setJerseyAwaitingPosition] = useState<{ teamSide: TeamSide; jersey: number } | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState(false);

  const resetDetails = () => {
    setBallType(null);
    setBlockers(null);
    setCombination(null);
  };

  const closePicker = () => {
    setPickerTarget(null);
    setPickerDismissed(true);
    setShowMoreJerseys(false);
    setJerseyAwaitingPosition(null);
    setAssignError(false);
  };

  // Every new tag (or a new rally) starts again from the suggestion.
  useEffect(() => {
    setTeamOverride(null);
    setSkillOverride(null);
    setPlayerId(null);
    resetDetails();
    setPendingSubstitution(null);
    setSubstitutionError(false);
    setPickerTarget(null);
    setPickerDismissed(false);
    setShowMoreJerseys(false);
    setJerseyAwaitingPosition(null);
    setAssignError(false);
  }, [currentRallyTouches.length, servingTeam]);

  const teamSide: TeamSide = teamOverride ?? suggestion?.teamSide ?? leftTeamSide;
  const skill: SkillType = skillOverride ?? (teamOverride && teamOverride !== suggestion?.teamSide ? 'dig' : suggestion?.skill ?? 'attack');

  const getTeam = (side: TeamSide) => (side === 'home' ? homeTeam : awayTeam);
  const getLineup = (side: TeamSide) => (side === 'home' ? homeLineup : awayLineup);
  const teamName = (side: TeamSide) => getTeam(side).name || t(side === 'home' ? 'home' : 'away');

  const playerAt = (side: TeamSide, position: CourtPosition): Player | null => {
    const slot = getLineup(side)?.slots.find((candidate) => candidate.courtPosition === position);
    return getTeam(side).players.find((candidate) => candidate.id === slot?.playerId) ?? null;
  };
  const onCourtIds = (side: TeamSide) => new Set(getLineup(side)?.slots.map((slot) => slot.playerId).filter(Boolean) ?? []);
  const liberosOf = (side: TeamSide) => {
    const onCourt = onCourtIds(side);
    return getTeam(side).players.filter((player) => getLineup(side)?.liberoPlayerIds.includes(player.id) && !onCourt.has(player.id));
  };
  const benchOf = (side: TeamSide) => {
    const onCourt = onCourtIds(side);
    const liberos = new Set(liberosOf(side).map((player) => player.id));
    return getTeam(side).players.filter((player) => !onCourt.has(player.id) && !liberos.has(player.id));
  };
  const emptyPositionsOf = (side: TeamSide) => ([1, 2, 3, 4, 5, 6] as CourtPosition[]).filter((position) => !playerAt(side, position));
  const isOnCourtOrLibero = (side: TeamSide, player: Player) => (
    onCourtIds(side).has(player.id) || liberosOf(side).some((libero) => libero.id === player.id)
  );

  const team = getTeam(teamSide);
  // Serving: the server (position 1) is the only possible player.
  const serverId = playerAt(teamSide, 1)?.id ?? null;
  const ownPlayerId = playerId && team.players.some((player) => player.id === playerId) ? playerId : null;
  const effectivePlayerId = ownPlayerId ?? (skill === 'serve' ? serverId : null);
  const selectedPlayer = team.players.find((player) => player.id === effectivePlayerId) ?? null;
  const evaluations = getEvaluationsForSkill(skill);
  const ballTypeOptions = getBallTypeOptionsForSkill(skill);
  const asksForServer = skill === 'serve' && !serverId && !ownPlayerId && !pickerDismissed;
  const activePicker: PickerTarget | null = pickerTarget ?? (asksForServer ? { teamSide, position: 1 } : null);
  const isPickerOpen = activePicker !== null || jerseyAwaitingPosition !== null;

  const selectPlayer = (side: TeamSide, id: string) => {
    if (side !== teamSide) {
      // Another team's player: the skill falls back to the guess for that team.
      setTeamOverride(side === suggestion?.teamSide ? null : side);
      setSkillOverride(null);
      resetDetails();
    }
    setPlayerId(id);
  };

  const selectSkill = (next: SkillType) => {
    setSkillOverride(next);
    resetDetails();
  };

  const openPicker = (side: TeamSide, position: CourtPosition | null) => {
    setPickerTarget({ teamSide: side, position });
    setShowMoreJerseys(false);
    setJerseyAwaitingPosition(null);
    setAssignError(false);
  };

  const assignJersey = async (side: TeamSide, jerseyNumber: number, position: CourtPosition | null) => {
    setIsAssigning(true);
    setAssignError(false);
    const assignedId = await onAssignJersey(side, jerseyNumber, position);
    setIsAssigning(false);
    if (!assignedId) {
      setAssignError(true);
      return;
    }
    selectPlayer(side, assignedId);
    closePicker();
  };

  const pickJersey = (jerseyNumber: number) => {
    if (!activePicker || isAssigning) return;
    const { teamSide: side, position } = activePicker;
    if (position !== null) {
      void assignJersey(side, jerseyNumber, position);
      return;
    }
    // Any player: someone already on court is simply selected; a new server takes
    // position 1; otherwise ask which empty position they are in.
    const existing = getTeam(side).players.find((player) => player.jerseyNumber === jerseyNumber);
    if (existing && isOnCourtOrLibero(side, existing)) {
      selectPlayer(side, existing.id);
      closePicker();
      return;
    }
    const emptyPositions = emptyPositionsOf(side);
    if (skill === 'serve' && side === teamSide && emptyPositions.includes(1)) {
      void assignJersey(side, jerseyNumber, 1);
      return;
    }
    if (emptyPositions.length > 0) {
      setJerseyAwaitingPosition({ teamSide: side, jersey: jerseyNumber });
      return;
    }
    // Court full: the player joins the team and the tag asks whom they replaced.
    void assignJersey(side, jerseyNumber, null);
  };

  const handleEvaluation = (evaluation: SkillEvaluation) => {
    if (!selectedPlayer || pendingPoint) return;
    if (!isOnCourtOrLibero(teamSide, selectedPlayer)) {
      setSubstitutionError(false);
      setPendingSubstitution({ evaluation });
      return;
    }
    commitTag(evaluation);
  };

  const handleSubstitutionChoice = (playerOutId: string) => {
    if (!pendingSubstitution || !selectedPlayer) return;
    if (!onSubstitute(teamSide, playerOutId, selectedPlayer.id)) {
      setSubstitutionError(true);
      return;
    }
    const { evaluation } = pendingSubstitution;
    setPendingSubstitution(null);
    commitTag(evaluation);
  };

  const commitTag = (evaluation: SkillEvaluation) => {
    if (!selectedPlayer) return;
    const code = buildTagCode({
      teamSide,
      jerseyNumber: selectedPlayer.jerseyNumber,
      skill,
      evaluation,
      ballType: ballTypeOptions.some((option) => option.code === ballType) ? ballType : null,
      combination,
    });
    const recordedAtIso = new Date().toISOString();
    const touches = buildPendingTouchesFromParsed(parseDataVolleyInput(code), {
      homeLineup,
      awayLineup,
      homePlayers: homeTeam.players,
      awayPlayers: awayTeam.players,
      currentRallyTouches,
      servingTeam,
      recordedAtIso,
      recordedAtTime: formatDataVolleyTime(recordedAtIso),
    });
    if (touches.length === 0) return;
    // Tags carry no direction: keep the placeholder zone out of the exported codes.
    touches.forEach((touch) => { touch.withoutZones = true; });
    if (skill === 'attack' && blockers !== null) {
      const attack = touches.find((touch) => touch.skill === 'attack');
      if (attack) attack.numBlockers = blockers;
    }
    onCommitTouches(touches);

    const outcome = resolveRallyOutcomeFromTouch({ teamSide, skill, evaluation });
    if (outcome.kind === 'point') {
      if (confirmPoint) {
        setPendingPoint({ teamSide: outcome.pointTeam, reason: outcome.reason });
      } else {
        onFinalizeRally(outcome.pointTeam, outcome.reason);
      }
    }
  };

  const pointSummary = ({ teamSide: side, reason }: PendingPoint) => {
    const reasonKey = getRallyEndReasonKey(reason);
    return reasonKey
      ? t('pointForTeamWithReason', { team: teamName(side), reason: t(reasonKey) })
      : t('pointForTeam', { team: teamName(side) });
  };

  const playerLabel = (player: Player) => (hasPlayerName(player) ? (player.lastName || player.firstName || player.displayName) : '');

  const renderPlayerButton = (side: TeamSide, player: Player, caption: string, extraClass = '') => {
    const isSelected = side === teamSide && effectivePlayerId === player.id;
    return (
      <button
        key={player.id}
        type="button"
        className={`tag-input__player${extraClass}${isSelected ? ' is-selected' : ''}${player.isLibero ? ' is-libero' : ''}`}
        aria-pressed={isSelected}
        onClick={() => selectPlayer(side, player.id)}
      >
        <strong>{player.jerseyNumber}</strong>
        <span>{caption}</span>
      </button>
    );
  };

  const renderHalf = (side: TeamSide, courtSide: CourtSide) => (
    <div
      className={`tag-court__half tag-court__half--${courtSide}${side === teamSide ? ' is-active' : ''}`}
      role="group"
      aria-label={teamName(side)}
    >
      {HALF_LAYOUT[courtSide].flat().map((position) => {
        const player = playerAt(side, position);
        if (player) {
          return renderPlayerButton(side, player, `P${position}${playerLabel(player) ? ` ${playerLabel(player)}` : ''}`, ' tag-court__player');
        }
        const isTarget = activePicker?.teamSide === side && activePicker.position === position;
        return (
          <button
            key={`empty-${position}`}
            type="button"
            className={`tag-input__player tag-input__player--empty tag-court__player${isTarget ? ' is-selected' : ''}`}
            onClick={() => openPicker(side, position)}
          >
            <strong>+</strong>
            <span>P{position}</span>
          </button>
        );
      })}
    </div>
  );

  const renderTeamExtras = (side: TeamSide) => (
    <div className={`tag-court__extras${side === teamSide ? ' is-active' : ''}`} key={side}>
      <span className="tag-court__team-name">{teamName(side)}</span>
      {liberosOf(side).map((player) => renderPlayerButton(side, player, t('libero'), ' tag-court__extra'))}
      <button type="button" className="tag-input__bench-toggle" onClick={() => openPicker(side, null)}>
        {t('tagBenchAndNumbers')}
      </button>
    </div>
  );

  const pickerTeam = activePicker?.teamSide ?? jerseyAwaitingPosition?.teamSide ?? teamSide;
  const pickerOnCourt = new Set([...onCourtIds(pickerTeam)].map((id) => getTeam(pickerTeam).players.find((player) => player.id === id)?.jerseyNumber));

  const renderPicker = () => (
    <div className="tag-input__picker" role="group" aria-label={t('tagJerseyButton')}>
      <div className="tag-input__picker-head">
        <span>
          {jerseyAwaitingPosition
            ? t('tagJerseyWhichPosition', { player: `#${jerseyAwaitingPosition.jersey}` })
            : activePicker?.position
              ? t('tagJerseyPromptPosition', { team: teamName(pickerTeam), position: `P${activePicker.position}` })
              : t('tagJerseyPrompt', { team: teamName(pickerTeam) })}
        </span>
        <button type="button" className="tag-input__picker-cancel" onClick={closePicker}>{t('cancel')}</button>
      </div>
      {jerseyAwaitingPosition ? (
        <div className="tag-input__picker-grid tag-input__picker-grid--positions">
          {emptyPositionsOf(jerseyAwaitingPosition.teamSide).map((position) => (
            <button
              key={position}
              type="button"
              disabled={isAssigning}
              onClick={() => void assignJersey(jerseyAwaitingPosition.teamSide, jerseyAwaitingPosition.jersey, position)}
            >
              P{position}
            </button>
          ))}
          <button
            type="button"
            disabled={isAssigning}
            onClick={() => void assignJersey(jerseyAwaitingPosition.teamSide, jerseyAwaitingPosition.jersey, null)}
          >
            {t('tagJerseyFromBench')}
          </button>
        </div>
      ) : (
        <>
          {activePicker?.position === null && benchOf(pickerTeam).length > 0 ? (
            <div className="tag-input__picker-grid tag-input__picker-grid--bench">
              {benchOf(pickerTeam).map((player) => (
                <button key={player.id} type="button" disabled={isAssigning} onClick={() => pickJersey(player.jerseyNumber)}>
                  <strong>{player.jerseyNumber}</strong>
                  {playerLabel(player) ? <small>{playerLabel(player)}</small> : null}
                </button>
              ))}
            </div>
          ) : null}
          <div className="tag-input__picker-grid">
            {(showMoreJerseys ? MORE_JERSEYS : COMMON_JERSEYS).map((jersey) => (
              <button
                key={jersey}
                type="button"
                disabled={isAssigning || (activePicker?.position !== null && pickerOnCourt.has(jersey))}
                onClick={() => pickJersey(jersey)}
              >
                {jersey}
              </button>
            ))}
            <button type="button" className="tag-input__picker-more" onClick={() => setShowMoreJerseys((open) => !open)}>
              {showMoreJerseys ? '1–30' : '31–99'}
            </button>
          </div>
        </>
      )}
      {assignError ? <small className="tag-input__substitution-error">{t('tagJerseyNotAssigned')}</small> : null}
    </div>
  );

  const halves: Array<[TeamSide, CourtSide]> = vertical
    ? [[rightTeamSide, 'top'], [leftTeamSide, 'bottom']]
    : [[leftTeamSide, 'left'], [rightTeamSide, 'right']];

  return (
    <section className={`tag-input${vertical ? ' tag-input--vertical' : ''}`} aria-label={t('tagInputTitle')}>
      {/* Who (players on court) and what (skill, details, grade, point): side by side on a landscape phone. */}
      <div className="tag-input__who">
        <div className="tag-input__rally" aria-live="polite">
          {currentRallyTouches.length === 0 ? (
            <span className="tag-input__rally-empty">{t('tagRallyEmpty')}</span>
          ) : currentRallyTouches.map((touch) => {
            const jersey = getTeam(touch.teamSide).players.find((player) => player.id === touch.playerId)?.jerseyNumber;
            return (
              <span key={touch.id} className={`tag-input__chip tag-input__chip--${touch.teamSide === leftTeamSide ? 'left' : 'right'}`}>
                #{jersey ?? '?'} {t(getSkillTranslationKey(touch.skill))} {touch.evaluation ?? ''}
              </span>
            );
          })}
        </div>

        {vertical ? renderTeamExtras(rightTeamSide) : null}
        <div className={`tag-court tag-court--${vertical ? 'vertical' : 'horizontal'}`}>
          {renderHalf(halves[0][0], halves[0][1])}
          <div className="tag-court__net" aria-hidden="true" />
          {renderHalf(halves[1][0], halves[1][1])}
        </div>
        {vertical ? renderTeamExtras(leftTeamSide) : (
          <div className="tag-court__extras-row">
            {renderTeamExtras(leftTeamSide)}
            {renderTeamExtras(rightTeamSide)}
          </div>
        )}
      </div>

      <div className="tag-input__what">
        {isPickerOpen ? renderPicker() : (
          <>
            <div className="tag-input__skills" role="group" aria-label={t('skill')}>
              {TAG_SKILLS.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  className={`tag-input__skill${skill === candidate ? ' is-selected' : ''}`}
                  aria-pressed={skill === candidate}
                  onClick={() => selectSkill(candidate)}
                >
                  {t(getSkillTranslationKey(candidate))}
                </button>
              ))}
            </div>

            {ballTypeOptions.length > 0 || skill === 'attack' || skill === 'set' ? (
              <div className="tag-input__details" role="group" aria-label={t('tagDetails')}>
                {ballTypeOptions.length > 0 ? (
                  <div className="tag-input__detail-group" aria-label={t('ballType')}>
                    {ballTypeOptions.map((option) => (
                      <button
                        key={option.code}
                        type="button"
                        className={`tag-input__detail${ballType === option.code ? ' is-selected' : ''}`}
                        aria-pressed={ballType === option.code}
                        title={t(option.labelKey)}
                        onClick={() => setBallType((current) => (current === option.code ? null : option.code))}
                      >
                        {option.code}
                      </button>
                    ))}
                  </div>
                ) : null}
                {skill === 'attack' ? (
                  <div className="tag-input__detail-group" aria-label={t('numBlockers')}>
                    <span className="tag-input__detail-label">{t('numBlockersShort')}</span>
                    {BLOCKER_OPTIONS.map((count) => (
                      <button
                        key={count}
                        type="button"
                        className={`tag-input__detail${blockers === count ? ' is-selected' : ''}`}
                        aria-pressed={blockers === count}
                        title={t(`numBlockers${count}` as TranslationKey)}
                        onClick={() => setBlockers((current) => (current === count ? null : count))}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                ) : null}
                {skill === 'attack' || skill === 'set' ? (
                  <div className="tag-input__detail-group" aria-label={t('combination')}>
                    {COMBINATION_OPTIONS.map((code) => (
                      <button
                        key={code}
                        type="button"
                        className={`tag-input__detail${combination === code ? ' is-selected' : ''}`}
                        aria-pressed={combination === code}
                        title={t(`combination${code}` as TranslationKey)}
                        onClick={() => setCombination((current) => (current === code ? null : code))}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="tag-input__evals" role="group" aria-label={t('evaluation')}>
              {EVALUATION_ORDER.map((evaluation) => {
                const available = evaluations.includes(evaluation);
                return (
                  <button
                    key={evaluation}
                    type="button"
                    className={`tag-input__eval tag-input__eval--${EVAL_SUFFIX[evaluation].toLowerCase()}`}
                    disabled={!available || !selectedPlayer || Boolean(pendingPoint)}
                    onClick={() => handleEvaluation(evaluation)}
                  >
                    <span className="tag-input__eval-symbol">{evaluation}</span>
                    <span className="tag-input__eval-label">{available ? t(evalShortLabelKey(skill, evaluation)) : ''}</span>
                  </button>
                );
              })}
            </div>

            {pendingSubstitution && selectedPlayer ? (
              <div className="tag-input__confirm tag-input__substitution" role="alertdialog">
                <span>
                  {t('tagSubstitutionQuestion', { player: `#${selectedPlayer.jerseyNumber}` })}
                  {substitutionError ? <small className="tag-input__substitution-error">{t('tagSubstitutionNotAllowed')}</small> : null}
                </span>
                <div className="tag-input__substitution-options">
                  {([1, 2, 3, 4, 5, 6] as CourtPosition[])
                    .map((position) => ({ position, player: playerAt(teamSide, position) }))
                    .filter((entry): entry is { position: CourtPosition; player: Player } => Boolean(entry.player && !entry.player.isLibero))
                    .map(({ position, player }) => (
                      <button key={player.id} type="button" className="tag-input__substitution-option" onClick={() => handleSubstitutionChoice(player.id)}>
                        #{player.jerseyNumber} <small>P{position}</small>
                      </button>
                    ))}
                </div>
                <button type="button" className="tag-input__confirm-no" onClick={() => setPendingSubstitution(null)}>
                  {t('cancel')}
                </button>
              </div>
            ) : pendingPoint ? (
              <div className="tag-input__confirm" role="alertdialog">
                <span>{pointSummary(pendingPoint)}</span>
                {/* The tag was the last recorded action, so the regular undo removes exactly it
                    (and its undo entry); removing only the touch would leave a stale entry behind. */}
                <button type="button" className="tag-input__confirm-no" onClick={() => { setPendingPoint(null); onUndo(); }}>
                  {t('tagUndoTag')}
                </button>
                <button type="button" className="tag-input__confirm-yes" onClick={() => { onFinalizeRally(pendingPoint.teamSide, pendingPoint.reason); setPendingPoint(null); }}>
                  {t('confirm')}
                </button>
              </div>
            ) : (
              <div className="tag-input__footer">
                <button type="button" className="tag-input__point" onClick={() => onFinalizeRally(leftTeamSide)}>
                  {t('pointForTeam', { team: teamName(leftTeamSide) })}
                </button>
                <button type="button" className="tag-input__undo" onClick={onUndo} disabled={!canUndo}>
                  {t('undoAction')}
                </button>
                <button type="button" className="tag-input__point" onClick={() => onFinalizeRally(rightTeamSide)}>
                  {t('pointForTeam', { team: teamName(rightTeamSide) })}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
