import Discover from './Discover.jsx';

// The Search tab is now purely "browse and pick what to download". The
// Quick Add input + Upload zone live under Playlists, where they fit the
// "add things to your library" mental model better.
export default function Search() {
  return (
    <div className="pb-6">
      <header className="px-4 pt-6 pb-3">
        <h1 className="text-2xl font-bold">Search</h1>
      </header>
      <Discover />
    </div>
  );
}
