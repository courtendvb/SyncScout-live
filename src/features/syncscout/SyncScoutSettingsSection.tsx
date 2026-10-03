import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import { clearSyncScoutAuth, isSyncScoutAvailable, loadSyncScoutAuth } from './syncscout-settings';
import { SyncScoutLoginForm } from './SyncScoutLoginForm';
import './send-to-syncscout.css';

/** Settings page block: the SyncScout team login used by "Send to SyncScout". */
export function SyncScoutSettingsSection() {
  const { t } = useTranslation();
  const [auth, setAuth] = useState(loadSyncScoutAuth);

  return (
    <div className="send-syncscout">
      <h3 className="send-syncscout__title">{t('syncScoutSettingsTitle')}</h3>
      {!isSyncScoutAvailable() ? (
        <p className="send-syncscout__hint">{t('syncScoutUnavailable')}</p>
      ) : auth ? (
        <div className="send-syncscout__account">
          <span>{t('syncScoutLoggedInAs', { team: auth.teamName })}</span>
          <button type="button" className="btn-secondary btn-small" onClick={() => { clearSyncScoutAuth(); setAuth(null); }}>
            {t('syncScoutLogout')}
          </button>
        </div>
      ) : (
        <SyncScoutLoginForm onLoggedIn={setAuth} />
      )}
    </div>
  );
}
