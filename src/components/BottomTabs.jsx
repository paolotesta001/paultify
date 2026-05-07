// Spotify-style bottom navigation. Three tabs, fixed at the bottom, sitting
// above the iOS home indicator via env(safe-area-inset-bottom). Persistent
// across views — switching tab swaps the main content but the mini-player
// rail right above stays untouched.

const HomeIcon = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
    <path d="M3 12L12 3l9 9v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2v-9z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SearchIcon = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" strokeLinecap="round" />
  </svg>
);

const ListIcon = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2}>
    <path d="M3 6h13M3 12h13M3 18h9" strokeLinecap="round" />
    <circle cx="20" cy="18" r="2" fill={active ? 'currentColor' : 'none'} />
  </svg>
);

const TABS = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'search', label: 'Search', Icon: SearchIcon },
  { id: 'playlists', label: 'Playlists', Icon: ListIcon }
];

export default function BottomTabs({ active, onChange }) {
  return (
    <nav
      className="bg-ink-900/95 backdrop-blur-xl border-t border-ink-700/60"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <li key={id} className="flex-1">
              <button
                onClick={() => onChange(id)}
                className={
                  'w-full py-2 flex flex-col items-center justify-center gap-0.5 transition-colors ' +
                  (isActive ? 'text-ink-100' : 'text-ink-500')
                }
                aria-label={label}
              >
                <Icon active={isActive} />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
