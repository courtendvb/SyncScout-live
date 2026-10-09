import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation, type Locale } from '@src/i18n';

const primaryNavItems = [
  { path: '/teams', labelKey: 'teams' },
  { path: '/match', labelKey: 'match' },
  { path: '/scouting', labelKey: 'scouting' },
  { path: '/systems', labelKey: 'systems' },
  { path: '/load-data', labelKey: 'loadData' },
] as const;

const secondaryNavItems = [
  { path: '/settings', labelKey: 'settings' },
  { path: '/about', labelKey: 'about' },
] as const;

const LOCALE_BUTTONS: Array<{ locale: Locale; label: string }> = [
  { locale: 'en', label: 'EN' },
  { locale: 'ja', label: 'JP' },
];

export function AppNavigation({ compact = false }: { compact?: boolean }) {
  const { t, locale, setLocale } = useTranslation();
  const location = useLocation();
  const isScoutingRoute = location.pathname === '/scouting';
  const isCompact = compact || isScoutingRoute;

  return (
    <header className={`app-header${isCompact ? ' app-header--compact' : ''}`}>
      <div className="app-header__inner">
        <div className="app-header__left">
          <NavLink to="/" end className="app-header__brand">
            {t('appName')}
          </NavLink>
          <nav className="app-header__nav app-header__nav--left" aria-label={t('home')}>
            <NavLink to="/" end className={({ isActive }) => `app-header__link${isActive ? ' is-active' : ''}`}>
              {t('home')}
            </NavLink>
          </nav>
        </div>

        <nav className="app-header__nav app-header__nav--primary" aria-label={t('collection')}>
          {primaryNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `app-header__link${isActive ? ' is-active' : ''}`}
            >
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        <nav className="app-header__nav app-header__nav--secondary" aria-label={t('settings')}>
          {secondaryNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `app-header__link app-header__link--secondary${isActive ? ' is-active' : ''}`}
            >
              {t(item.labelKey)}
            </NavLink>
          ))}
          <div className="app-header__locale" role="group" aria-label={t('language')}>
            {LOCALE_BUTTONS.map((item) => (
              <button
                key={item.locale}
                type="button"
                lang={item.locale}
                className={`app-header__locale-button${locale === item.locale ? ' is-active' : ''}`}
                aria-pressed={locale === item.locale}
                onClick={() => setLocale(item.locale)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
}
