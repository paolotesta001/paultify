import { useState } from 'react';
import { useDownloadQueue } from '../hooks/useDownloadQueue.jsx';

const STATUS_LABEL = {
  queued: 'Waiting…',
  downloading: 'Downloading',
  parsing: 'Saving',
  lyrics: 'Fetching lyrics',
  done: '✓ Saved',
  error: 'Error'
};

const STATUS_COLOR = {
  queued: 'text-ink-400',
  downloading: 'text-ink-100',
  parsing: 'text-ink-100',
  lyrics: 'text-ink-100',
  done: 'text-accent',
  error: 'text-red-400'
};

// A floating circular button that surfaces queue activity from any tab.
// The badge shows in-flight + queued count; tapping opens a sheet that
// slides up from the bottom (mobile) or sits as a floating panel (desktop).
//
// Why a sheet instead of a sidebar? On a phone the sidebar would either
// vanish or compete with the tab bar. A sheet is the iOS-native pattern.
export default function DownloadQueue() {
  const { items, remove, clearDone } = useDownloadQueue();
  const [open, setOpen] = useState(false);

  if (!items.length) return null;

  const active = items.filter(it =>
    it.status !== 'done' && it.status !== 'error'
  ).length;
  const finished = items.length - active;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed right-3 z-30 rounded-full bg-accent text-ink-900 shadow-lg flex items-center gap-2 px-4 py-2 active:scale-95"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 132px)' }}
        aria-label="Show download queue"
      >
        <Spinner active={active > 0} />
        <span className="text-sm font-semibold tabular-nums">
          {active > 0 ? active : finished}
        </span>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-sm flex items-end sm:items-center sm:justify-center"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-ink-900 border-t sm:border border-ink-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] flex flex-col"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">Downloads</h3>
                <p className="text-xs text-ink-400">
                  {active > 0 ? `${active} in progress` : `${finished} done`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {finished > 0 && (
                  <button
                    onClick={clearDone}
                    className="px-2 py-1 text-[11px] uppercase tracking-wider text-ink-400 hover:text-ink-200"
                  >
                    Clear done
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 flex items-center justify-center text-ink-400 hover:text-ink-100 text-xl"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>

            <ul className="overflow-y-auto px-3 pb-4 space-y-2">
              {items.map(item => (
                <li
                  key={item.id}
                  className="rounded-lg bg-ink-800 border border-ink-700/60 p-3"
                >
                  <p className="text-sm font-medium text-ink-100 truncate">
                    {item.title || item.query}
                  </p>
                  {item.artist && (
                    <p className="text-[11px] text-ink-400 truncate">{item.artist}</p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className={`text-[11px] ${STATUS_COLOR[item.status] || 'text-ink-400'}`}>
                      {STATUS_LABEL[item.status] || item.status}
                      {(item.status === 'downloading' || item.status === 'parsing' || item.status === 'lyrics') && (
                        <span className="inline-block ml-1 animate-pulse">…</span>
                      )}
                    </span>
                    <button
                      onClick={() => remove(item.id)}
                      className="text-[10px] uppercase tracking-wider text-ink-500 hover:text-ink-300"
                    >
                      {item.status === 'done' || item.status === 'error' ? 'Hide' : 'Cancel'}
                    </button>
                  </div>
                  {item.error && (
                    <p className="mt-1 text-[10px] text-red-400 break-words">{item.error}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function Spinner({ active }) {
  if (!active) return (
    <span className="inline-block w-4 h-4 rounded-full bg-ink-900/50" />
  );
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" className="animate-spin">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M12 3 a9 9 0 0 1 9 9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
