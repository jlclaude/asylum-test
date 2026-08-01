import { useEffect } from "react";
import { useSpinMusic } from "../../hooks/useSpinMusic";

export function SpinMusicControls() {
  const music = useSpinMusic();
  const selected = music.tracks.find((track) => track.id === music.trackId);
  useEffect(() => music.stopPreview, [music.stopPreview]);
  return (
    <section className="studio-music-controls" aria-label="Spin music controls">
      <label>Spin music<select value={music.trackId} onChange={(event) => music.selectTrack(event.target.value)}>
        <option value="">No music</option>
        {music.tracks.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}
      </select></label>
      <div><span>Selected track</span><strong>{selected?.label ?? "No music"}</strong></div>
      <div><span>Music status</span><strong>{music.status}</strong></div>
      <label>Music volume<input type="range" min="0" max="1" step="0.05" value={music.volume} onChange={(event) => music.setVolume(Number(event.target.value))} /></label>
      <button type="button" aria-pressed={music.muted} onClick={() => music.setMuted(!music.muted)}>{music.muted ? "Music Muted" : "Music On"}</button>
      <button type="button" disabled={!music.trackId || music.muted} onClick={() => { void music.preview(); }}>Test / Preview</button>
      <button type="button" onClick={music.stopPreview}>Stop Preview</button>
      {music.status === "PAUSED" ? <button type="button" onClick={() => { void music.resume(); }}>Resume Music</button> : null}
      {music.warning ? <p role="alert">{music.warning}</p> : null}
    </section>
  );
}
