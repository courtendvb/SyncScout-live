import { useState } from 'react';
import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { Player, Team } from '@src/domain/roster/types';
import type { QuickEntryPlayer } from '@src/domain/roster/quick-entry';
import type { QuickJerseyEntryOutcome } from '@src/components/roster/QuickJerseyEntry';
import { useTranslation } from '@src/i18n';
import { getSelectedLineupPlayerIds, type TeamSetSetupState } from '../model/set-start';
import './simple-lineup-screen.css';

// Court as seen from behind the team, net at the top: front row 4-3-2, back row 5-6-1.
const COURT_ROWS: CourtPosition[][] = [[4, 3, 2], [5, 6, 1]];
const ENTRY_ORDER: CourtPosition[] = [1, 2, 3, 4, 5, 6];
const COMMON_JERSEYS = Array.from({ length: 30 }, (_, index) => index + 1);
const MORE_JERSEYS = Array.from({ length: 69 }, (_, index) => index + 31);

interface SimpleLineupScreenProps {
  team: Team;
  teamSide: TeamSide;
  state: TeamSetSetupState;
  selectedPosition: CourtPosition;
  /** Shown when the lineup is incomplete and "Next" was pressed once. */
  incompleteWarning?: string | null;
  notice?: string | null;
  onSelectedPositionChange: (position: CourtPosition) => void;
  onSlotChange: (position: CourtPosition, playerId: string) => void;
  onSetterChange: (playerId: string) => void;
  onLiberoChange: (index: 0 | 1, playerId: string) => void;
  onRotateClockwise: () => void;
  onQuickAddPlayers?: (players: QuickEntryPlayer[]) => Promise<QuickJerseyEntryOutcome>;
  onShowDetailed: () => void;
}

/**
 * Starting lineup for button input (tag / basic): tap a position, tap the
 * jersey number. New numbers join the team; the next empty position is
 * selected so the six starters go in P1 → P6 order with one tap each.
 */
export function SimpleLineupScreen({
  team,
  teamSide,
  state,
  selectedPosition,
  incompleteWarning,
  notice,
  onSelectedPositionChange,
  onSlotChange,
  onSetterChange,
  onLiberoChange,
  onRotateClockwise,
  onQuickAddPlayers,
  onShowDetailed,
}: SimpleLineupScreenProps) {
  const { t } = useTranslation();
  const [showMoreJerseys, setShowMoreJerseys] = useState(false);
  const [liberoMode, setLiberoMode] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const playerById = (id: string) => team.players.find((player) => player.id === id) ?? null;
  const lineupIds = new Set(getSelectedLineupPlayerIds(state));
  const lineupJerseys = new Set([...lineupIds].map((id) => playerById(id)?.jerseyNumber));
  const liberoJerseys = new Set(state.liberoPlayerIds.map((id) => playerById(id)?.jerseyNumber));
  const knownJerseys = new Set(team.players.map((player) => player.jerseyNumber));
  const filledCount = lineupIds.size;

  const nextEmptyAfter = (position: CourtPosition): CourtPosition | null => {
    const start = ENTRY_ORDER.indexOf(position);
    const order = [...ENTRY_ORDER.slice(start + 1), ...ENTRY_ORDER.slice(0, start)];
    return order.find((candidate) => !state.slots[candidate]) ?? null;
  };

  const pickForPosition = async (jersey: number) => {
    const position = selectedPosition;
    const existing = team.players.find((player) => player.jerseyNumber === jersey && !player.isLibero);
    if (existing) {
      if (state.slots[position] !== existing.id) onSlotChange(position, existing.id);
    } else if (onQuickAddPlayers) {
      // A new number joins the team and fills the selected (now empty) position.
      if (state.slots[position]) onSlotChange(position, '');
      setIsAdding(true);
      await onQuickAddPlayers([{ jerseyNumber: jersey, isLibero: false }]);
      setIsAdding(false);
    }
    const next = nextEmptyAfter(position);
    if (next) onSelectedPositionChange(next);
  };

  const pickLibero = async (jersey: number) => {
    const existing = team.players.find((player) => player.jerseyNumber === jersey);
    if (existing?.isLibero) {
      if (!state.liberoPlayerIds.includes(existing.id)) {
        onLiberoChange(state.liberoPlayerIds.length === 0 ? 0 : 1, existing.id);
      }
    } else if (!existing && onQuickAddPlayers) {
      setIsAdding(true);
      await onQuickAddPlayers([{ jerseyNumber: jersey, isLibero: true }]);
      setIsAdding(false);
    }
    setLiberoMode(false);
  };

  const pick = (jersey: number) => {
    if (isAdding) return;
    void (liberoMode ? pickLibero(jersey) : pickForPosition(jersey));
  };

  const lineupPlayers = ENTRY_ORDER
    .map((position) => ({ position, player: playerById(state.slots[position]) }))
    .filter((entry): entry is { position: CourtPosition; player: Player } => Boolean(entry.player));

  return (
    <div className="simple-lineup">
      <header className="simple-lineup__header">
        <div>
          <span className="simple-lineup__kicker">{t(teamSide === 'home' ? 'setSetupStepHome' : 'setSetupStepAway')}</span>
          <h2 className="simple-lineup__title">{team.name}</h2>
        </div>
        <span className="simple-lineup__count">{t('simpleLineupCount', { count: filledCount })}</span>
      </header>

      <p className="simple-lineup__hint">{t('simpleLineupHint')}</p>
      {notice ? <p className="set-start-notice" role="status">{notice}</p> : null}

      <div className="simple-lineup__court-row">
        <div className="simple-lineup__court" role="group" aria-label={t('selectStartingLineup')}>
          <div className="simple-lineup__net" aria-hidden="true" />
          {COURT_ROWS.flat().map((position) => {
            const player = playerById(state.slots[position]);
            const isSelected = !liberoMode && position === selectedPosition;
            const isSetter = Boolean(player) && state.setterPlayerId === player?.id;
            return (
              <button
                key={position}
                type="button"
                className={`simple-lineup__slot${isSelected ? ' is-selected' : ''}${player ? ' is-filled' : ''}`}
                aria-pressed={isSelected}
                onClick={() => { setLiberoMode(false); onSelectedPositionChange(position); }}
              >
                <strong>{player ? player.jerseyNumber : '+'}</strong>
                <span>P{position}{isSetter ? ` · ${t('setterPositionShort')}` : ''}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="simple-lineup__rotate" onClick={onRotateClockwise} title={t('setSetupRotateClockwise')}>
          <span aria-hidden="true">↻</span>
          <small>{t('simpleLineupRotate')}</small>
        </button>
      </div>

      <div className="simple-lineup__liberos">
        <span>{t('libero')}</span>
        {state.liberoPlayerIds.map((id) => (
          <span key={id} className="simple-lineup__chip is-libero">{playerById(id)?.jerseyNumber}</span>
        ))}
        {state.liberoPlayerIds.length < 2 ? (
          <button
            type="button"
            className={`simple-lineup__chip${liberoMode ? ' is-selected' : ''}`}
            aria-pressed={liberoMode}
            onClick={() => setLiberoMode((open) => !open)}
          >
            {t('simpleLineupAddLibero')}
          </button>
        ) : null}
      </div>

      <div className="simple-lineup__picker">
        <p className="simple-lineup__picker-title">
          {liberoMode ? t('simpleLineupPickLibero') : t('simpleLineupPickFor', { position: `P${selectedPosition}` })}
        </p>
        <div className="simple-lineup__grid">
          {(showMoreJerseys ? MORE_JERSEYS : COMMON_JERSEYS).map((jersey) => (
            <button
              key={jersey}
              type="button"
              disabled={isAdding}
              className={`${lineupJerseys.has(jersey) ? 'is-in-lineup' : ''}${liberoJerseys.has(jersey) ? ' is-libero' : ''}${knownJerseys.has(jersey) ? ' is-known' : ''}`}
              onClick={() => pick(jersey)}
            >
              {jersey}
            </button>
          ))}
          <button type="button" className="simple-lineup__more" onClick={() => setShowMoreJerseys((open) => !open)}>
            {showMoreJerseys ? '1–30' : '31–99'}
          </button>
        </div>
      </div>

      {lineupPlayers.length > 0 ? (
        <div className="simple-lineup__setter">
          <span>{t('simpleLineupSetter')}</span>
          {lineupPlayers.map(({ position, player }) => (
            <button
              key={player.id}
              type="button"
              className={`simple-lineup__chip${state.setterPlayerId === player.id ? ' is-selected' : ''}`}
              aria-pressed={state.setterPlayerId === player.id}
              onClick={() => onSetterChange(player.id)}
            >
              {player.jerseyNumber} <small>P{position}</small>
            </button>
          ))}
        </div>
      ) : null}

      {incompleteWarning ? <p className="simple-lineup__warning" role="alert">{incompleteWarning}</p> : null}

      <button type="button" className="simple-lineup__detailed" onClick={onShowDetailed}>
        {t('simpleLineupShowDetailed')}
      </button>
    </div>
  );
}
