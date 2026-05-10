import YouTubeSearch from './YouTubeSearch.jsx';
import SpotifyImport from './SpotifyImport.jsx';
import UploadZone from './UploadZone.jsx';

// Dedicated tab for everything that puts new music in your library:
//   • Quick Add — type a name or paste a YouTube URL → yt-dlp grabs it
//   • Spotify  — paste any public playlist / album / track URL
//   • Upload   — drag MP3s from your device
// Playlists tab is now strictly for managing existing playlists.
export default function Add({ onSpotifyImported }) {
  return (
    <div className="px-4 pt-6 pb-20 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Add to library</h1>
      <p className="text-sm text-ink-400 mb-5">
        Three ways to bring music in. Mix and match.
      </p>

      <Section
        title="Quick add"
        subtitle="A song name or a YouTube URL. Returns instantly to the queue."
      >
        <YouTubeSearch />
      </Section>

      <Section
        title="From Spotify"
        subtitle="Paste any public playlist, album, or track URL."
      >
        <SpotifyImport onImported={onSpotifyImported} />
      </Section>

      <Section
        title="From your device"
        subtitle="Drop MP3 files (and optional .lrc lyrics) you already have."
      >
        <UploadZone />
      </Section>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold mb-1">{title}</h2>
      <p className="text-[11px] text-ink-500 mb-2.5">{subtitle}</p>
      {children}
    </section>
  );
}
