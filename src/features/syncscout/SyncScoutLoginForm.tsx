import { useState } from 'react';
import { useTranslation, type TranslationKey } from '@src/i18n';
import { SYNCSCOUT_SITE_URL, loadLastSyncScoutSlug, saveSyncScoutAuth, type SyncScoutAuth } from './syncscout-settings';
import { loginToSyncScout, type SyncScoutLoginFailure } from './syncscout-client';

const FAILURE_KEYS: Record<SyncScoutLoginFailure, TranslationKey> = {
  network: 'syncScoutLoginNetwork',
  locked: 'syncScoutLoginLocked',
  payment: 'syncScoutLoginPayment',
  inactive: 'syncScoutLoginInactive',
  expired: 'syncScoutLoginExpired',
  server: 'syncScoutLoginServer',
  invalid: 'syncScoutLoginInvalid',
};

interface SyncScoutLoginFormProps {
  onLoggedIn: (auth: SyncScoutAuth) => void;
  /** Shown above the form, e.g. when an earlier login has expired. */
  notice?: string;
}

/** SyncScout team login (team ID + passcode), the same one the SyncScout viewer uses. */
export function SyncScoutLoginForm({ onLoggedIn, notice }: SyncScoutLoginFormProps) {
  const { t } = useTranslation();
  const [slug, setSlug] = useState(loadLastSyncScoutSlug);
  const [passcode, setPasscode] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [failure, setFailure] = useState<SyncScoutLoginFailure | 'required' | null>(null);

  const submit = async () => {
    if (!slug.trim() || !passcode.trim()) {
      setFailure('required');
      return;
    }
    setIsChecking(true);
    setFailure(null);
    const result = await loginToSyncScout(slug, passcode);
    setIsChecking(false);
    if (result.ok) {
      saveSyncScoutAuth(result.auth);
      setPasscode('');
      onLoggedIn(result.auth);
    } else {
      setFailure(result.reason);
    }
  };

  const upgradeUrl = `${SYNCSCOUT_SITE_URL}upgrade.html?slug=${encodeURIComponent(slug.trim().toLowerCase())}`;

  return (
    <form
      className="send-syncscout__login"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="send-syncscout__hint">{notice ?? t('syncScoutLoginDescription')}</p>
      <label className="send-syncscout__field">
        <span>{t('syncScoutTeamId')}</span>
        <input
          className="form-input"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
        />
      </label>
      <label className="send-syncscout__field">
        <span>{t('syncScoutPasscode')}</span>
        <input
          className="form-input"
          type="password"
          autoComplete="current-password"
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
        />
      </label>
      <div className="send-syncscout__actions">
        <button type="submit" className="btn-primary" disabled={isChecking}>
          {isChecking ? t('syncScoutLoggingIn') : t('syncScoutLogin')}
        </button>
      </div>
      {failure ? (
        <p className="send-syncscout__error" role="alert">
          {t(failure === 'required' ? 'syncScoutLoginRequired' : FAILURE_KEYS[failure])}
          {failure === 'expired' ? (
            <>
              {' '}
              <a href={upgradeUrl} target="_blank" rel="noopener noreferrer">{t('syncScoutUpgradeLink')}</a>
            </>
          ) : null}
        </p>
      ) : null}
      <p className="send-syncscout__hint">
        {t('syncScoutNoAccount')}{' '}
        <a href={SYNCSCOUT_SITE_URL} target="_blank" rel="noopener noreferrer">{t('syncScoutAboutLink')}</a>
      </p>
    </form>
  );
}
