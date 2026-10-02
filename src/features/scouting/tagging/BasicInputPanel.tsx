import type { TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Player } from '@src/domain/roster/types';
import type { BallTouch } from '@src/domain/touch/types';
import { useTranslation } from '@src/i18n';
import type { PendingTouch } from '../model';
import { createBasicServeTouch, formatDataVolleyTime } from '../expert/pending-touch-builder';
import './basic-input-panel.css';

interface BasicInputPanelProps {
  homeName: string;
  awayName: string;
  homePlayers: Player[];
  awayPlayers: Player[];
  homeLineup: ActiveLineup | null;
  awayLineup: ActiveLineup | null;
  servingTeam: TeamSide | null;
  currentRallyTouches: BallTouch[];
  leftTeamSide: TeamSide;
  rightTeamSide: TeamSide;
  onCommitTouches: (touches: PendingTouch[]) => void;
  onFinalizeRally: (teamSide: TeamSide) => void;
  onUndo: () => void;
  canUndo: boolean;
}

/**
 * Beginner input: tap "Serve" when the ball is served and the winning team when
 * the rally ends. Serve and point times are enough for SyncScout to play the
 * match rally by rally, without the time between rallies.
 */
export function BasicInputPanel({
  homeName,
  awayName,
  homePlayers,
  awayPlayers,
  homeLineup,
  awayLineup,
  servingTeam,
  currentRallyTouches,
  leftTeamSide,
  rightTeamSide,
  onCommitTouches,
  onFinalizeRally,
  onUndo,
  canUndo,
}: BasicInputPanelProps) {
  const { t } = useTranslation();
  const teamName = (side: TeamSide) => (side === 'home' ? homeName : awayName) || t(side === 'home' ? 'home' : 'away');
  const isRallyRunning = currentRallyTouches.some((touch) => touch.skill === 'serve');
  // The server is whoever stands in P1 now; it changes by itself as the team rotates.
  const servingLineup = servingTeam === 'home' ? homeLineup : servingTeam === 'away' ? awayLineup : null;
  const serverId = servingLineup?.slots.find((slot) => slot.courtPosition === 1)?.playerId;
  const server = serverId
    ? (servingTeam === 'home' ? homePlayers : awayPlayers).find((player) => player.id === serverId) ?? null
    : null;

  const recordServe = () => {
    if (!servingTeam || isRallyRunning) return;
    const recordedAtIso = new Date().toISOString();
    onCommitTouches([createBasicServeTouch({
      servingTeam,
      servingLineup: servingTeam === 'home' ? homeLineup : awayLineup,
      recordedAtIso,
      recordedAtTime: formatDataVolleyTime(recordedAtIso),
    })]);
  };

  return (
    <section className="basic-input" aria-label={t('inputModeBasic')}>
      <p className="basic-input__status" aria-live="polite">
        {isRallyRunning
          ? t('basicInputRallyRunning')
          : servingTeam
            ? t('basicInputNextServe', { team: server ? `${teamName(servingTeam)} #${server.jerseyNumber}` : teamName(servingTeam) })
            : ''}
      </p>

      <button
        type="button"
        className="basic-input__serve"
        disabled={!servingTeam || isRallyRunning}
        onClick={recordServe}
      >
        <strong>{server ? t('basicInputServeBy', { number: server.jerseyNumber }) : t('basicInputServe')}</strong>
        {servingTeam ? <span>{teamName(servingTeam)}</span> : null}
      </button>

      <div className="basic-input__points" role="group" aria-label={t('basicInputWhoScored')}>
        {[leftTeamSide, rightTeamSide].map((side) => (
          <button
            key={side}
            type="button"
            className={`basic-input__point${isRallyRunning ? ' is-ready' : ''}`}
            onClick={() => onFinalizeRally(side)}
          >
            <span>{t('basicInputPointFor')}</span>
            <strong>{teamName(side)}</strong>
          </button>
        ))}
      </div>

      <p className="basic-input__hint">{t('basicInputHint')}</p>

      <button type="button" className="basic-input__undo" onClick={onUndo} disabled={!canUndo}>
        {t('undoAction')}
      </button>
    </section>
  );
}
