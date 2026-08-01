export type SpinMusicTrack = { id: string; label: string; file: string };
export type SpinMusicStatus = "OFF" | "READY" | "PLAYING" | "PAUSED";
export type SpinMusicSnapshot = {
  tracks: SpinMusicTrack[];
  trackId: string;
  volume: number;
  muted: boolean;
  status: SpinMusicStatus;
  warning: string | null;
};

const TRACK_KEY = "asylumGames.music.trackId";
const VOLUME_KEY = "asylumGames.music.volume";
const MUTED_KEY = "asylumGames.music.muted";
const listeners = new Set<() => void>();
let audio: HTMLAudioElement | null = null;
let ownerId: string | null = null;
let pendingElapsed = 0;
let catalogPromise: Promise<SpinMusicTrack[]> | null = null;
let initialized = false;
let playbackRequest = 0;

const state: SpinMusicSnapshot = { tracks: [], trackId: "", volume: 0.7, muted: false, status: "OFF", warning: null };
let snapshot: SpinMusicSnapshot = { ...state };
const emit = () => { snapshot = { ...state }; listeners.forEach((listener) => listener()); };
const save = (key: string, value: string) => {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, value); } catch { /* non-blocking */ }
};

function validTrack(value: unknown): value is SpinMusicTrack {
  if (!value || typeof value !== "object") return false;
  const track = value as Record<string, unknown>;
  return typeof track.id === "string" && typeof track.label === "string" &&
    typeof track.file === "string" && /^\/music\/.+\.(mp3|wav|m4a|ogg)$/i.test(track.file);
}

export function loopingPlaybackOffset(elapsedSeconds: number, trackDuration: number) {
  if (!Number.isFinite(elapsedSeconds) || !Number.isFinite(trackDuration) || trackDuration <= 0) return 0;
  return Math.max(0, elapsedSeconds) % trackDuration;
}

export async function loadSpinMusicCatalog() {
  if (typeof window === "undefined") return [];
  catalogPromise ??= fetch("/music/manifest.json")
    .then(async (response) => {
      if (!response.ok) throw new Error("Music manifest could not be loaded.");
      const value: unknown = await response.json();
      if (!Array.isArray(value)) throw new Error("Music manifest must contain an array.");
      return value.filter(validTrack);
    })
    .catch((error: unknown) => {
      state.warning = error instanceof Error ? error.message : "Music manifest could not be loaded.";
      return [];
    })
    .then((tracks) => { state.tracks = tracks; emit(); return tracks; });
  return catalogPromise;
}

export function initializeSpinMusic() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;
  try {
    state.trackId = localStorage.getItem(TRACK_KEY) ?? "";
    const volume = Number(localStorage.getItem(VOLUME_KEY));
    state.volume = Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : 0.7;
    state.muted = localStorage.getItem(MUTED_KEY) === "true";
  } catch { /* defaults remain usable */ }
  state.status = state.trackId && !state.muted ? "READY" : "OFF";
  void loadSpinMusicCatalog();
  emit();
}

function stopAudio() {
  if (!audio) return;
  audio.onloadedmetadata = null;
  audio.onerror = null;
  audio.pause();
  try { audio.currentTime = 0; } catch { /* unloaded media */ }
  audio.src = "";
  audio.load();
  audio = null;
  ownerId = null;
}

async function play(owner: string, elapsedSeconds: number, loop: boolean) {
  if (typeof window === "undefined") return false;
  const track = state.tracks.find((item) => item.id === state.trackId);
  stopAudio();
  state.warning = null;
  if (!track || state.muted) { state.status = "OFF"; emit(); return false; }

  ownerId = owner;
  pendingElapsed = Math.max(0, elapsedSeconds);
  audio = new Audio(track.file);
  audio.preload = "auto";
  audio.loop = loop;
  audio.volume = state.volume;
  audio.onerror = () => {
    state.status = "PAUSED";
    state.warning = `Unable to play ${track.label}. The wheel will continue silently.`;
    emit();
  };
  audio.onloadedmetadata = () => {
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = loopingPlaybackOffset(pendingElapsed, audio.duration);
    }
  };

  try {
    await audio.play();
    state.status = "PLAYING";
    emit();
    return true;
  } catch {
    state.status = "PAUSED";
    state.warning = "Click to resume spin music";
    emit();
    return false;
  }
}

export async function startSpinMusic(wheelId: string, elapsedSeconds = 0) {
  const request = ++playbackRequest;
  await loadSpinMusicCatalog();
  if (request !== playbackRequest) return false;
  return play(wheelId, elapsedSeconds, true);
}
export async function previewSpinMusic() {
  const request = ++playbackRequest;
  await loadSpinMusicCatalog();
  if (request !== playbackRequest) return false;
  return play("preview", 0, true);
}
export async function resumeSpinMusic() {
  if (!audio) return startSpinMusic(ownerId ?? "resume", pendingElapsed);
  try { await audio.play(); state.status = "PLAYING"; state.warning = null; emit(); return true; }
  catch { state.status = "PAUSED"; state.warning = "Click to resume spin music"; emit(); return false; }
}
export function stopSpinMusic(requestingOwner?: string) {
  if (requestingOwner && ownerId && requestingOwner !== ownerId) return;
  playbackRequest += 1;
  stopAudio();
  state.status = state.trackId && !state.muted ? "READY" : "OFF";
  state.warning = null;
  emit();
}
export function stopSpinMusicPreview() { stopSpinMusic("preview"); }
export function selectSpinMusicTrack(trackId: string) {
  playbackRequest += 1;
  stopAudio(); state.trackId = trackId; save(TRACK_KEY, trackId);
  state.status = trackId && !state.muted ? "READY" : "OFF"; state.warning = null; emit();
}
export function setSpinMusicVolume(volume: number) {
  state.volume = Math.min(Math.max(volume, 0), 1); if (audio) audio.volume = state.volume;
  save(VOLUME_KEY, String(state.volume)); emit();
}
export function setSpinMusicMuted(muted: boolean) {
  state.muted = muted; save(MUTED_KEY, String(muted));
  if (muted) { playbackRequest += 1; stopAudio(); }
  state.status = state.trackId && !muted ? "READY" : "OFF"; emit();
}
export function getSpinMusicSnapshot(): SpinMusicSnapshot { return snapshot; }
export function subscribeToSpinMusic(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
