export type MusicTrack = { id: string; label: string; file: string };
export type MusicPlaylist = "IDLE" | "SPIN";
export type SpinMusicStatus = "OFF" | "READY" | "PLAYING" | "PAUSED";
export type SpinMusicSnapshot = {
  idleTracks: MusicTrack[];
  spinTracks: MusicTrack[];
  activeTrackId: string;
  activePlaylist: MusicPlaylist | null;
  volume: number;
  muted: boolean;
  status: SpinMusicStatus;
  warning: string | null;
};

const VOLUME_KEY = "asylumGames.music.volume";
const MUTED_KEY = "asylumGames.music.muted";
const FADE_OUT_MS = 750;
const listeners = new Set<() => void>();
const discoveredIdleTracks = typeof __ASYLUM_PRE_SPIN_TRACKS__ === "undefined" ? [] : __ASYLUM_PRE_SPIN_TRACKS__;
const discoveredSpinTracks = typeof __ASYLUM_SPIN_TRACKS__ === "undefined" ? [] : __ASYLUM_SPIN_TRACKS__;
let audio: HTMLAudioElement | null = null;
let ownerId: string | null = null;
let pendingElapsed = 0;
let initialized = false;
let playbackRequest = 0;
let fadeTimer: number | null = null;
let lastIdleTrackId = "";
let lastSpinTrackId = "";

const state: SpinMusicSnapshot = {
  idleTracks: [...discoveredIdleTracks],
  spinTracks: [...discoveredSpinTracks],
  activeTrackId: "",
  activePlaylist: null,
  volume: 0.7,
  muted: false,
  status: "OFF",
  warning: null,
};
let snapshot: SpinMusicSnapshot = { ...state };
const emit = () => { snapshot = { ...state }; listeners.forEach((listener) => listener()); };
const save = (key: string, value: string) => {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, value); } catch { /* non-blocking */ }
};

export function chooseRandomTrack<T extends { id: string }>(
  tracks: T[],
  previousId: string,
  random: () => number = Math.random,
): T | null {
  if (tracks.length === 0) return null;
  const choices = tracks.length > 1 ? tracks.filter((track) => track.id !== previousId) : tracks;
  const index = Math.min(Math.floor(Math.max(0, random()) * choices.length), choices.length - 1);
  return choices[index] ?? null;
}

export function loopingPlaybackOffset(elapsedSeconds: number, trackDuration: number) {
  if (!Number.isFinite(elapsedSeconds) || !Number.isFinite(trackDuration) || trackDuration <= 0) return 0;
  return Math.max(0, elapsedSeconds) % trackDuration;
}

function clearFade() {
  if (fadeTimer !== null && typeof window !== "undefined") window.clearInterval(fadeTimer);
  fadeTimer = null;
}

function stopAudio() {
  clearFade();
  if (audio) {
    audio.onloadedmetadata = null;
    audio.onerror = null;
    audio.pause();
    try { audio.currentTime = 0; } catch { /* unloaded media */ }
    audio.src = "";
    audio.load();
  }
  audio = null;
  ownerId = null;
  state.activeTrackId = "";
  state.activePlaylist = null;
}

async function playFromPlaylist(
  playlist: MusicPlaylist,
  owner: string,
  elapsedSeconds: number,
  request: number,
  attempted = new Set<string>(),
): Promise<boolean> {
  if (typeof window === "undefined" || request !== playbackRequest) return false;
  const tracks = playlist === "IDLE" ? state.idleTracks : state.spinTracks;
  const available = tracks.filter((track) => !attempted.has(track.id));
  const previousId = playlist === "IDLE" ? lastIdleTrackId : lastSpinTrackId;
  const track = chooseRandomTrack(available, previousId);
  stopAudio();
  state.warning = null;
  if (!track || state.muted) {
    state.status = "OFF";
    emit();
    return false;
  }

  if (playlist === "IDLE") lastIdleTrackId = track.id;
  else lastSpinTrackId = track.id;
  ownerId = owner;
  pendingElapsed = Math.max(0, elapsedSeconds);
  state.activeTrackId = track.id;
  state.activePlaylist = playlist;
  audio = new Audio(track.file);
  audio.preload = "auto";
  audio.loop = true;
  audio.volume = state.volume;
  const currentAudio = audio;
  currentAudio.onloadedmetadata = () => {
    if (audio === currentAudio && Number.isFinite(currentAudio.duration) && currentAudio.duration > 0) {
      currentAudio.currentTime = loopingPlaybackOffset(pendingElapsed, currentAudio.duration);
    }
  };
  currentAudio.onerror = () => {
    if (audio !== currentAudio || request !== playbackRequest) return;
    attempted.add(track.id);
    state.warning = `Unable to load ${track.label}; trying another ${playlist === "IDLE" ? "pre-spin" : "spin"} track.`;
    emit();
    void playFromPlaylist(playlist, owner, elapsedSeconds, request, attempted);
  };

  try {
    await currentAudio.play();
    if (request !== playbackRequest || audio !== currentAudio) return false;
    state.status = "PLAYING";
    emit();
    return true;
  } catch {
    if (request !== playbackRequest || audio !== currentAudio) return false;
    state.status = "PAUSED";
    state.warning = "Browser autoplay is paused. Click Resume Music to continue.";
    emit();
    return false;
  }
}

export function initializeSpinMusic() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;
  try {
    const volume = Number(localStorage.getItem(VOLUME_KEY));
    state.volume = Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : 0.7;
    state.muted = localStorage.getItem(MUTED_KEY) === "true";
  } catch { /* defaults remain usable */ }
  state.status = state.muted ? "OFF" : "READY";
  emit();
  if (!state.muted) void playIdleMusic();
}

export function playIdleMusic() {
  const request = ++playbackRequest;
  return playFromPlaylist("IDLE", "idle", 0, request);
}

export function startSpinMusic(wheelId: string, elapsedSeconds = 0) {
  const request = ++playbackRequest;
  return playFromPlaylist("SPIN", wheelId, elapsedSeconds, request);
}

export function finishSpinMusic(requestingOwner: string) {
  if (typeof window === "undefined") return;
  if (ownerId && ownerId !== requestingOwner) return;
  const request = ++playbackRequest;
  clearFade();
  const fadingAudio = audio;
  if (!fadingAudio || state.muted) {
    stopAudio();
    void playIdleMusic();
    return;
  }
  const startedAt = window.performance.now();
  const startingVolume = fadingAudio.volume;
  fadeTimer = window.setInterval(() => {
    if (audio !== fadingAudio || request !== playbackRequest) {
      clearFade();
      return;
    }
    const progress = Math.min((window.performance.now() - startedAt) / FADE_OUT_MS, 1);
    fadingAudio.volume = startingVolume * (1 - progress);
    if (progress >= 1) {
      stopAudio();
      if (request === playbackRequest) void playIdleMusic();
    }
  }, 40);
}

export function previewSpinMusic() {
  const request = ++playbackRequest;
  return playFromPlaylist("SPIN", "preview", 0, request);
}

export async function resumeSpinMusic() {
  if (!audio) return playIdleMusic();
  try {
    await audio.play();
    state.status = "PLAYING";
    state.warning = null;
    emit();
    return true;
  } catch {
    state.status = "PAUSED";
    state.warning = "Browser autoplay is paused. Click Resume Music to continue.";
    emit();
    return false;
  }
}

export function stopSpinMusic(requestingOwner?: string) {
  if (requestingOwner && ownerId && requestingOwner !== ownerId) return;
  playbackRequest += 1;
  stopAudio();
  state.status = state.muted ? "OFF" : "READY";
  state.warning = null;
  emit();
}

export function stopSpinMusicPreview() {
  if (ownerId !== "preview") return;
  stopSpinMusic("preview");
  if (!state.muted) void playIdleMusic();
}

export function setSpinMusicVolume(volume: number) {
  state.volume = Math.min(Math.max(volume, 0), 1);
  if (audio && fadeTimer === null) audio.volume = state.volume;
  save(VOLUME_KEY, String(state.volume));
  emit();
}

export function setSpinMusicMuted(muted: boolean) {
  state.muted = muted;
  save(MUTED_KEY, String(muted));
  if (muted) {
    playbackRequest += 1;
    stopAudio();
    state.status = "OFF";
    emit();
    return;
  }
  state.status = "READY";
  emit();
  void playIdleMusic();
}

export function getSpinMusicSnapshot(): SpinMusicSnapshot { return snapshot; }
export function subscribeToSpinMusic(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
