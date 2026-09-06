import {
  clampPlayerVolume,
  lessonPlayerStorageKeys,
  readAutoplayPreference,
  readMutedPreference,
  readPlaybackRatePreference,
  readVolumePreference,
} from "./player/lessonPlayerPersistence";

export interface LearningPlayerPreferences {
  autoplay: boolean;
  muted: boolean;
  playbackRate: number;
  volume: number;
}

export const DEFAULT_LEARNING_PLAYER_PREFERENCES: LearningPlayerPreferences = {
  autoplay: true,
  muted: false,
  playbackRate: 1,
  volume: 1,
};

const normalizePlaybackRate = (value: unknown): number => {
  const playbackRate = Number(value);
  return Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
};

const normalizePlayerPreferences = (
  value: Partial<LearningPlayerPreferences>,
): LearningPlayerPreferences => ({
  autoplay: value.autoplay === true,
  muted: value.muted === true,
  playbackRate: normalizePlaybackRate(value.playbackRate),
  volume: clampPlayerVolume(Number(value.volume)),
});

export const isLearningPlayerBootstrapState = (
  value: unknown,
): value is LearningPlayerPreferences => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LearningPlayerPreferences>;
  return (
    typeof candidate.autoplay === "boolean" &&
    typeof candidate.muted === "boolean" &&
    Number.isFinite(candidate.playbackRate) &&
    (candidate.playbackRate as number) > 0 &&
    Number.isFinite(candidate.volume)
  );
};

const applyLearningPlayerBootstrapDocument = (
  preferences: LearningPlayerPreferences,
) => {
  const root = document.documentElement;
  root.dataset.playerAutoplay = preferences.autoplay ? "on" : "off";
  root.dataset.playerMuted = preferences.muted ? "true" : "false";
  root.dataset.playerPlaybackRate = String(preferences.playbackRate);
  root.dataset.playerVolume = String(preferences.volume);
};

export const getInitialLearningPlayerPreferences =
  (): LearningPlayerPreferences => {
    if (typeof window === "undefined") {
      return DEFAULT_LEARNING_PLAYER_PREFERENCES;
    }

    const bootstrapState = window.__VEO_BOOTSTRAP__?.player;
    if (isLearningPlayerBootstrapState(bootstrapState)) {
      return normalizePlayerPreferences(bootstrapState);
    }

    return {
      autoplay: readAutoplayPreference(),
      muted: readMutedPreference(),
      playbackRate: readPlaybackRatePreference(),
      volume: readVolumePreference(),
    };
  };

export const publishLearningPlayerBootstrap = (
  patch: Partial<LearningPlayerPreferences>,
) => {
  if (typeof window === "undefined") return;

  const current = isLearningPlayerBootstrapState(
    window.__VEO_BOOTSTRAP__?.player,
  )
    ? normalizePlayerPreferences(window.__VEO_BOOTSTRAP__.player)
    : getInitialLearningPlayerPreferences();
  const next = { ...current, ...patch };
  window.__VEO_BOOTSTRAP__ = {
    ...window.__VEO_BOOTSTRAP__,
    player: next,
  };
  applyLearningPlayerBootstrapDocument(next);
};

export const getLearningPlayerBootstrapScript = () =>
  `(()=>{const r=document.documentElement;let a=true,u=false,p=1,v=1;try{const as=localStorage.getItem(${JSON.stringify(lessonPlayerStorageKeys.autoplay)});if(as!==null)a=as==="on"||as==="true";const ms=localStorage.getItem(${JSON.stringify(lessonPlayerStorageKeys.muted)});u=ms==="true"||ms==="on";const pr=Number(localStorage.getItem(${JSON.stringify(lessonPlayerStorageKeys.playbackRate)}));if(Number.isFinite(pr)&&pr>0)p=pr;const vs=localStorage.getItem(${JSON.stringify(lessonPlayerStorageKeys.volume)});if(vs!==null&&vs.trim()){const n=Number(vs);if(Number.isFinite(n))v=Math.min(1,Math.max(0,n))}}catch{}const s={autoplay:a,muted:u,playbackRate:p,volume:v};window.__VEO_BOOTSTRAP__={...window.__VEO_BOOTSTRAP__,player:s};r.dataset.playerAutoplay=a?"on":"off";r.dataset.playerMuted=u?"true":"false";r.dataset.playerPlaybackRate=String(p);r.dataset.playerVolume=String(v);const f=()=>{const sw=document.querySelector('[role="switch"][aria-label="Autoplay next lesson"]');if(sw){sw.setAttribute("aria-checked",String(a));sw.title=a?"Autoplay is on":"Autoplay is off";const t=sw.querySelector("[data-autoplay-track]");if(t)t.setAttribute("data-autoplay-track-state",a?"on":"off")}for(const b of document.querySelectorAll("[data-volume-level]")){b.setAttribute("aria-label",u?"Unmute":"Mute");b.setAttribute("title",u?"Unmute":"Mute");b.setAttribute("aria-pressed",String(u));b.dataset.volumeLevel=u?"muted":b.dataset.volumeLevel||"high"}for(const m of document.querySelectorAll("video")){m.muted=u;m.volume=v;try{m.playbackRate=p}catch{}}return Boolean(sw)};if(f())return;const o=new MutationObserver(()=>{if(f())o.disconnect()});o.observe(document.documentElement,{childList:true,subtree:true});document.addEventListener("DOMContentLoaded",()=>{if(f())o.disconnect()},{once:true})})();`;
