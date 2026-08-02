import { useEffect } from "react";
import { useSpinMusic } from "../../hooks/useSpinMusic";

export function SpinMusicControls() {
  const music = useSpinMusic();
  const selected = [...music.idleTracks, ...music.spinTracks].find((track) => track.id === music.activeTrackId);
  useEffect(() => music.stopPreview, [music.stopPreview]);
  return (
    <section className="studio-music-controls" aria-label="Spin music controls">
      <div><span>Music library</span><strong>{music.idleTracks.length} pre-spin · {music.spinTracks.length} spin</strong></div>
      <div><span>Active track</span><strong>{selected?.label ?? "No music"}</strong></div>
      <div><span>Playlist</span><strong>{music.activePlaylist ?? "STANDBY"}</strong></div>
      <div><span>Music status</span><strong>{music.status}</strong></div>
      <label>Music volume<input type="range" min="0" max="1" step="0.05" value={music.volume} onChange={(event) => music.setVolume(Number(event.target.value))} /></label>
      <button type="button" aria-pressed={music.muted} onClick={() => music.setMuted(!music.muted)}>{music.muted ? "Music Muted" : "Music On"}</button>
      <button type="button" disabled={music.spinTracks.length === 0 || music.muted} onClick={() => { void music.preview(); }}>Preview Random Spin Track</button>
      <button type="button" onClick={music.stopPreview}>Stop Preview</button>
      {music.status === "PAUSED" ? <button type="button" onClick={() => { void music.resume(); }}>Resume Music</button> : null}
      {music.warning ? <p role="alert">{music.warning}</p> : null}
    </section>
  );
}
