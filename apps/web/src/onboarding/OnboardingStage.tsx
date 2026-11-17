import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { SparkleIcon as Sparkle } from "@phosphor-icons/react/Sparkle";
import { useQueryClient } from "@tanstack/react-query";
import type {
  OnboardingAcademy,
  OnboardingStateResponse,
} from "@veolms/contracts";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";
import { getDefaultLoginMethod } from "../auth/authConfig";
import { getDefaultCountry } from "../auth/CountryCodeSelect";
import {
  formatNationalPhoneNumber,
  toInternationalPhoneNumber,
  validateEmail,
  validateMobile,
  type CountryOption,
} from "../auth/identifier";
import { rememberOauthHandoff } from "../auth/oauthFlow";
import { Button } from "../components/Button";
import { copyTextToClipboard } from "../lib/clipboard";
import { getApiError } from "../lib/api-error";
import { canOpenShareSheet } from "../lib/share";
import { cn } from "../lib/utils";
import {
  authService,
  useAuthConfig,
  useCurrentUser,
  useLogin,
  useRegister,
  useSendOtp,
} from "../services/auth";
import { onboardingKeys, onboardingService } from "../services/onboarding";
import { ensureAcademyPaletteStylesheets } from "../shell/academyPaletteStyles";
import { DEFAULT_ACADEMY_THEME } from "../themes";
import {
  academyUrl,
  addressFromName,
  nameFromEmail,
  usernameFrom,
} from "./academyNames";
import { LiveScreen } from "./LiveScreen";
import { LightEngine, type StageRect } from "./stage/lightEngine";
import {
  isStageSoundOn,
  setStageSoundOn,
  stageSound,
} from "./stage/stageSound";
import {
  CodeScreen,
  ContactScreen,
  DetailsScreen,
  LaunchScreen,
  StageArt,
  WelcomeScreen,
  type AddressState,
  type ContactMethod,
} from "./StageScreens";
import {
  LaunchButton,
  StageDock,
  StageQuestion,
  StageToast,
  StageTopBar,
  stageFocusClasses,
  stageGhostClasses,
} from "./StagePieces";

/**
 * The sign-up stage ("First Light", creator-features/33 and 38): one dark,
 * full-screen stage where a creator signs in and names their academy while
 * thousands of points of light take each answer's shape, then launches it.
 *
 * - `signup`, on the platform site: the whole flow, from the intro to Live.
 * - `replay`, on an academy's own address (its admin home's "Watch your
 *   launch again"): Ready to launch? and the launch, with nothing created.
 */

type Screen =
  | "intro"
  | "home"
  | "contact"
  | "code"
  | "welcome"
  | "details"
  | "launch"
  | "live"
  | "unavailable";

const PROGRESS: Record<Screen, number> = {
  intro: 0,
  home: 4,
  contact: 20,
  code: 32,
  welcome: 40,
  details: 60,
  launch: 88,
  live: 100,
  unavailable: 4,
};

const STAGE_PALETTE = "codex";
const INTRO_SEEN_KEY = "veolms-stage-intro-seen";
const CONTINUE_KEY = "veolms-stage-continue";
const TRIAL_DAYS = 14;
const DEFAULT_DOMAIN = "veolms.app";
const DAY_MS = 86_400_000;

/** The circle-and-tick the code bursts into (Phosphor's CheckCircle, fill). */
const CHECK_CIRCLE_PATH =
  "M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,85.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z";

const formatDate = (date: Date, options: Intl.DateTimeFormatOptions) =>
  date.toLocaleDateString("en-IN", options);

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    window.localStorage.setItem(key, "true");
  } catch {
    // Storage blocked: the intro plays again next time.
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function OnboardingStage({
  mode,
  replayName,
}: {
  mode: "signup" | "replay";
  /** In replay: the academy's name. */
  replayName?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const { data: authConfig } = useAuthConfig();
  const sendOtp = useSendOtp();
  const login = useLogin();
  const register = useRegister();

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const questionRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const liveboxRef = useRef<HTMLDivElement>(null);
  const launchButtonRef = useRef<HTMLButtonElement>(null);
  const dashboardButtonRef = useRef<HTMLButtonElement>(null);
  const engineRef = useRef<LightEngine | null>(null);
  const reducedRef = useRef(prefersReducedMotion());
  const aliveRef = useRef(true);
  const introTokenRef = useRef(0);

  const [screen, setScreen] = useState<Screen>("intro");
  const [introLine, setIntroLine] = useState(false);
  const [palette, setPalette] = useState(STAGE_PALETTE);
  const [toast, setToast] = useState<{
    text: string;
    tone: "ok" | "error";
    id: number;
  } | null>(null);

  // Step 1
  const [method, setMethod] = useState<ContactMethod>(getDefaultLoginMethod);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<CountryOption>(getDefaultCountry);
  const [contactError, setContactError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Who they are and what they have
  const [platform, setPlatform] = useState<OnboardingStateResponse | null>(
    null,
  );
  const [available, setAvailable] = useState<boolean | null>(
    mode === "replay" ? true : null,
  );
  const [opening, setOpening] = useState<string | null>(null);

  // Step 2
  const [name, setName] = useState(replayName ?? "");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [addressState, setAddressState] = useState<AddressState>("idle");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Step 3 and Live
  const [launching, setLaunching] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [countdown, setCountdown] = useState(false);
  const [academy, setAcademy] = useState<OnboardingAcademy | null>(null);
  const [liveShown, setLiveShown] = useState(false);
  const [entering, setEntering] = useState(false);

  const domain = platform?.academyDomain ?? DEFAULT_DOMAIN;
  const replayHost =
    typeof window !== "undefined" ? window.location.hostname : "";
  const host =
    mode === "replay"
      ? replayHost
      : (academy?.host ?? `${slug || "youracademy"}.${domain}`);
  const displayName = name.trim() || "Your academy";

  const showToast = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    setToast({ text, tone, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // The stage plays quietly on veolms.org: no sound, so no switch for it.
  // The visitor's own setting comes back when they leave.
  useEffect(() => {
    const before = isStageSoundOn();
    setStageSoundOn(false);
    return () => setStageSoundOn(before);
  }, []);

  const wait = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) =>
        window.setTimeout(resolve, reducedRef.current ? 0 : ms),
      ),
    [],
  );

  // ─── The stage's colours ────────────────────────────────────────────────
  // Black and white (Veo Onyx) until the launch; the academy's colour
  // (Ocean Blue) arrives with it. The visitor's own palette comes back when
  // they leave the stage.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.palette;
    return () => {
      if (previous === undefined) delete root.dataset.palette;
      else root.dataset.palette = previous;
    };
  }, []);

  // Signing up happens on veolms.org (/start), which is always dark: the
  // stage is too, while it is on screen.
  useEffect(() => {
    if (mode !== "signup") return;
    const root = document.documentElement;
    const previous = root.dataset.theme;
    root.dataset.theme = "dark";
    engineRef.current?.readTokens();
    return () => {
      if (previous === undefined) delete root.dataset.theme;
      else root.dataset.theme = previous;
    };
  }, [mode]);

  useLayoutEffect(() => {
    document.documentElement.dataset.palette = palette;
    void ensureAcademyPaletteStylesheets(palette).then(() => {
      engineRef.current?.readTokens();
    });
    engineRef.current?.readTokens();
  }, [palette]);

  // ─── The light ──────────────────────────────────────────────────────────

  const rectOf = useCallback((element: Element | null): StageRect | null => {
    const stage = stageRef.current;
    if (!element || !stage) return null;
    const a = stage.getBoundingClientRect();
    const r = element.getBoundingClientRect();
    return { x: r.left - a.left, y: r.top - a.top, w: r.width, h: r.height };
  }, []);

  const artRect = useCallback((): StageRect => {
    const engine = engineRef.current!;
    return (
      rectOf(artRef.current) ?? {
        x: engine.W * 0.1,
        y: engine.H * 0.25,
        w: engine.W * 0.8,
        h: engine.H * 0.4,
      }
    );
  }, [rectOf]);

  const stateRef = useRef({ screen, name, code });
  stateRef.current = { screen, name, code };

  /** Gives the light the current screen's shape. */
  const applyArt = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.readTokens();
    const {
      screen: current,
      name: currentName,
      code: currentCode,
    } = stateRef.current;
    const { W, H } = engine;
    if (
      current === "home" ||
      current === "welcome" ||
      current === "unavailable"
    ) {
      engine.galaxy(
        { x: 0, y: H * 0.12, w: W, h: H * (W < 700 ? 0.6 : 0.82) },
        0.2,
      );
      return;
    }
    if (current === "contact") {
      // A large globe behind the dock, running on behind the frosted glass.
      const question = rectOf(questionRef.current);
      const top = question ? question.y + question.h : artRect().y;
      const R = Math.max(
        60,
        Math.min(W * (W < 700 ? 0.42 : 0.26), (H - top) * 0.5),
      );
      engine.sphere(W / 2, top + 18 + R, R, 0.25);
      return;
    }
    if (current === "code") {
      // The same globe, smaller and centred, so its orbits fit.
      const r = artRect();
      engine.sphere(
        r.x + r.w / 2,
        r.y + r.h / 2,
        Math.max(36, Math.min(r.w, r.h) * 0.3),
        0.25,
        { orbits: true },
      );
      engine.setOrbits(currentCode.length);
      return;
    }
    if (current === "details") {
      engine.form(
        engine.sampleText(currentName.trim() || "Your academy", artRect()),
        {
          mix: currentName.trim() ? 0.25 : 0,
          alpha: currentName.trim() ? 0.95 : 0.45,
        },
      );
      return;
    }
    if (current === "launch") {
      engine.form(
        engine.sampleText(currentName.trim() || "Your academy", artRect()),
        { mix: 1, freeMix: 0.7 },
      );
    }
  }, [artRect, rectOf]);

  const artTimer = useRef(0);
  const artSoon = useCallback(() => {
    window.clearTimeout(artTimer.current);
    artTimer.current = window.setTimeout(applyArt, 40);
  }, [applyArt]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    aliveRef.current = true;
    const engine = new LightEngine(canvas, stage);
    engine.reduced = reducedRef.current;
    engineRef.current = engine;
    engine.readTokens();
    engine.start(() => {
      if (
        stateRef.current.screen !== "intro" &&
        stateRef.current.screen !== "live"
      ) {
        artSoon();
      }
    });
    // For checks in a background tab, where frames barely run.
    (
      window as unknown as { __stageSettle?: (n?: number) => void }
    ).__stageSettle = (n) => engine.settle(n);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => {
      reducedRef.current = media.matches;
      engine.reduced = media.matches;
    };
    media.addEventListener("change", onMotion);
    return () => {
      aliveRef.current = false;
      media.removeEventListener("change", onMotion);
      window.clearTimeout(artTimer.current);
      engine.destroy();
      engineRef.current = null;
    };
  }, [artSoon]);

  // Each new screen: its shape, and focus on its heading for screen readers.
  useEffect(() => {
    if (screen === "intro" || screen === "live") return;
    const frame = requestAnimationFrame(applyArt);
    return () => cancelAnimationFrame(frame);
  }, [screen, applyArt]);

  // ─── Whether this site takes sign-ups ───────────────────────────────────
  useEffect(() => {
    if (mode !== "signup") return;
    let cancelled = false;
    onboardingService.checkAddress("start").then(
      () => !cancelled && setAvailable(true),
      (error: unknown) =>
        !cancelled &&
        setAvailable(getApiError(error).status === 404 ? false : true),
    );
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // ─── After signing in: where to go ──────────────────────────────────────

  const loadPlatform = useCallback(async () => {
    const state = await queryClient.fetchQuery({
      queryKey: onboardingKeys.state(),
      queryFn: onboardingService.getState,
      staleTime: 0,
    });
    setPlatform(state);
    return state;
  }, [queryClient]);

  const startNew = useCallback(() => {
    setName("");
    setSlug("");
    setSlugEdited(false);
    setAddressState("idle");
    setSuggestions([]);
    setAgreed(false);
    setDetailsError(null);
    setScreen("details");
  }, []);

  const afterSignIn = useCallback(async () => {
    let state: OnboardingStateResponse;
    try {
      state = await loadPlatform();
    } catch (error) {
      showToast(getApiError(error).message, "error");
      setScreen("home");
      return;
    }
    if (!aliveRef.current) return;
    if (state.academies.length > 0) {
      setScreen("welcome");
      return;
    }
    const draft = state.draft;
    if (draft) {
      setName(draft.name);
      setSlug(draft.slug);
      setSlugEdited(draft.slug !== addressFromName(draft.name));
      setAgreed(draft.agreed);
      setAddressState(draft.slug ? "checking" : "idle");
      // A finished draft resumes at Launch, its name written in light.
      setScreen(
        draft.name && draft.slug && draft.agreed ? "launch" : "details",
      );
      return;
    }
    startNew();
  }, [loadPlatform, showToast, startNew]);

  // Back from Google: carry on where the visitor left.
  useEffect(() => {
    if (mode !== "signup" || !currentUser) return;
    let pending = false;
    try {
      pending = window.sessionStorage.getItem(CONTINUE_KEY) === "true";
      window.sessionStorage.removeItem(CONTINUE_KEY);
    } catch {
      pending = false;
    }
    if (pending) {
      introTokenRef.current += 1;
      engineRef.current?.calm();
      void afterSignIn();
    }
  }, [mode, currentUser, afterSignIn]);

  // ─── The intro ──────────────────────────────────────────────────────────

  const finishIntro = useCallback(() => {
    introTokenRef.current += 1;
    writeFlag(INTRO_SEEN_KEY);
    const engine = engineRef.current;
    if (engine) {
      engine.calm();
    }
    setIntroLine(false);
    setScreen((current) => (current === "intro" ? "home" : current));
  }, []);

  useEffect(() => {
    if (mode === "replay") {
      setScreen("launch");
      return;
    }
    const engine = engineRef.current;
    if (!engine || reducedRef.current || readFlag(INTRO_SEEN_KEY)) {
      setScreen("home");
      return;
    }
    const token = ++introTokenRef.current;
    const live = () => introTokenRef.current === token && aliveRef.current;
    void (async () => {
      // One spark pulses, bursts into a sky, and writes "VeoLMS".
      engine.resize();
      engine.readTokens();
      let c = { x: engine.W / 2, y: engine.H / 2 };
      engine.gather(c.x, c.y);
      for (let i = 0; i < 30; i++) {
        if (!live()) return;
        engine.seed = Math.min(1, engine.seed + 0.04);
        await wait(26);
      }
      await wait(250);
      if (!live()) return;
      c = { x: engine.W / 2, y: engine.H / 2 };
      engine.seed = 0;
      engine.flash = 0.5;
      engine.flashCentre = [c.x, c.y];
      engine.shock = { x: c.x, y: c.y, r: 4, a: 0.6 };
      engine.trails = true;
      engine.burst(c.x, c.y, [4, 22]);
      engine.field(0);
      engine.kMul = 0.25;
      await wait(1100);
      if (!live()) return;
      engine.trails = false;
      engine.kMul = 1;
      engine.form(
        engine.sampleText("VeoLMS", {
          x: engine.W * 0.12,
          y: engine.H * 0.26,
          w: engine.W * 0.76,
          h: engine.H * 0.34,
        }),
        { mix: 0 },
      );
      await wait(1500);
      if (!live()) return;
      setIntroLine(true);
      await wait(2000);
      if (!live()) return;
      finishIntro();
    })();
    return () => {
      introTokenRef.current += 1;
    };
    // Once, when the stage opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Step 1 ─────────────────────────────────────────────────────────────

  const sentTo =
    method === "mobile"
      ? `${country.dialCode} ${formatNationalPhoneNumber(phone, country)}`
      : email.trim();
  const identity = (): { email: string } | { phoneNo: string } =>
    method === "mobile"
      ? { phoneNo: toInternationalPhoneNumber(phone, country) }
      : { email: email.trim() };

  // Each keystroke: the globe pulses and spins a little faster.
  const onEmailChange = (value: string) => {
    setContactError(null);
    setEmail(value);
    engineRef.current?.nudgeSphere();
  };
  const onMobileChange = (value: string) => {
    setContactError(null);
    setPhone(formatNationalPhoneNumber(value, country));
    engineRef.current?.nudgeSphere();
  };

  const sendCode = async (): Promise<boolean> => {
    try {
      await sendOtp.mutateAsync(identity());
      return true;
    } catch (error) {
      setContactError(getApiError(error).message);
      return false;
    }
  };

  const submitContact = async () => {
    if (sending) return;
    const problem =
      method === "mobile"
        ? validateMobile(phone, country)
        : validateEmail(email);
    if (problem) {
      setContactError(problem);
      return;
    }
    setSending(true);
    stageSound.tick(900);
    const sent = await sendCode();
    if (!sent || !aliveRef.current) {
      setSending(false);
      return;
    }
    setCode("");
    setCodeError(null);
    // The light streams up off the screen, like the message leaving.
    const engine = engineRef.current;
    if (engine && !reducedRef.current) {
      engine.sendAway();
      await wait(780);
      engine.trails = false;
      engine.kMul = 1;
    }
    setSending(false);
    setScreen("code");
  };

  const resendCode = async () => {
    setCodeError(null);
    setSending(true);
    const sent = await sendCode();
    setSending(false);
    if (sent) showToast(`A new code is on its way to ${sentTo}`);
    else setCodeError("We couldn't send a new code. Try again in a minute.");
  };

  const onCodeChange = (value: string) => {
    setCodeError(null);
    setCode(value);
    if (value.length < 6) {
      stageSound.tick(560 + value.length * 60);
      engineRef.current?.setOrbits(value.length);
    }
    if (value.length === 6) void verifyCode(value);
  };

  const verifyCode = async (value = code) => {
    if (checking || value.length < 6) return;
    setChecking(true);
    const who = identity();
    try {
      try {
        await login.mutateAsync({ ...who, code: value });
      } catch (error) {
        const problem = getApiError(error);
        if (problem.code !== "REGISTRATION_REQUIRED") throw error;
        // A creator new to VeoLMS: an account on the first code, with no
        // username or name to type.
        const seed = "email" in who ? who.email.split("@")[0]! : "creator";
        await register.mutateAsync({
          ...who,
          code: value,
          username: usernameFrom(seed),
          displayName: "email" in who ? nameFromEmail(who.email) : "Creator",
        });
      }
    } catch (error) {
      if (!aliveRef.current) return;
      setChecking(false);
      setCode("");
      engineRef.current?.setOrbits(0);
      setCodeError(getApiError(error).message);
      return;
    }
    if (!aliveRef.current) return;
    // The globe, wrapped in its six orbits, bursts into a big tick.
    const engine = engineRef.current;
    if (engine) {
      window.clearTimeout(artTimer.current);
      engine.readTokens();
      const r = artRect();
      engine.form(engine.sampleIcon([CHECK_CIRCLE_PATH], r, { scale: 0.9 }), {
        mix: 1,
        freeMix: 0.5,
      });
      engine.flash = 0.22;
      engine.flashCentre = [engine.W / 2, r.y + r.h / 2];
    }
    stageSound.chimeShort();
    await wait(1100);
    setChecking(false);
    await afterSignIn();
  };

  const signInWithGoogle = async () => {
    setGoogleBusy(true);
    setContactError(null);
    try {
      rememberOauthHandoff("google", "/start");
      window.sessionStorage.setItem(CONTINUE_KEY, "true");
      const { url } = await authService.getOauthUrl({
        provider: "google",
        redirectUri: `${window.location.origin}/auth/callback`,
      });
      window.location.assign(url);
    } catch (error) {
      setGoogleBusy(false);
      setContactError(getApiError(error).message);
    }
  };

  // ─── Step 2 ─────────────────────────────────────────────────────────────

  const addressCheck = useRef(0);
  const checkAddress = useCallback((value: string) => {
    const ticket = ++addressCheck.current;
    setSuggestions([]);
    if (!value) {
      setAddressState("idle");
      return;
    }
    if (value.length < 3) {
      setAddressState("short");
      return;
    }
    setAddressState("checking");
    window.setTimeout(() => {
      if (ticket !== addressCheck.current) return;
      onboardingService.checkAddress(value).then(
        (answer) => {
          if (ticket !== addressCheck.current) return;
          setAddressState(answer.state);
          setSuggestions(answer.suggestions);
        },
        () => {
          if (ticket === addressCheck.current) setAddressState("error");
        },
      );
    }, 420);
  }, []);

  // A draft or a name typed before: its address checked again on arrival.
  useEffect(() => {
    if (
      (screen === "details" || screen === "launch") &&
      addressState === "checking" &&
      slug
    ) {
      checkAddress(slug);
    }
    // Only when a screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const onNameChange = (value: string) => {
    setName(value);
    setDetailsError(null);
    if (!slugEdited) {
      const next = addressFromName(value);
      setSlug(next);
      checkAddress(next);
    }
    stateRef.current = { ...stateRef.current, name: value };
    artSoon();
  };

  const onSlugChange = (value: string) => {
    const next = addressFromName(value);
    setSlug(next);
    setSlugEdited(true);
    setDetailsError(null);
    checkAddress(next);
  };

  const canContinue = name.trim().length > 1 && addressState === "ok" && agreed;

  const saveDraft = async () =>
    await onboardingService.saveDraft({ name: name.trim(), slug, agreed });

  const continueToLaunch = async () => {
    if (!canContinue || savingDraft) return;
    setSavingDraft(true);
    try {
      await saveDraft();
      stageSound.tick(740);
      setScreen("launch");
    } catch (error) {
      setDetailsError(getApiError(error).message);
    } finally {
      setSavingDraft(false);
    }
  };

  // ─── Step 3: the launch ─────────────────────────────────────────────────

  const launchingRef = useRef(false);

  /** The light show, once the academy exists (about six seconds). */
  const playLaunch = async () => {
    const engine = engineRef.current;
    const stage = stageRef.current;
    if (!engine || !stage) return;
    setLeaving(true);
    // Colour arrives: a wave ripples out from the launch button.
    const button = rectOf(launchButtonRef.current);
    setPalette(DEFAULT_ACADEMY_THEME);
    await ensureAcademyPaletteStylesheets(DEFAULT_ACADEMY_THEME);
    engine.readTokens();
    if (button) engine.ripple(button.x + button.w / 2, button.y + button.h / 2);
    const big = {
      x: engine.W * 0.1,
      y: engine.H * 0.12,
      w: engine.W * 0.8,
      h: engine.H * 0.62,
    };
    if (!reducedRef.current) {
      stageSound.riser(3.3);
      setCountdown(true);
      for (const n of ["3", "2", "1"]) {
        engine.form(engine.sampleText(n, big, { scale: 0.95 }), {
          mix: 1,
          freeMix: 0.8,
        });
        engine.kMul = 1.4;
        stageSound.tick(n === "1" ? 1320 : 990);
        await wait(820);
      }
      setCountdown(false);
      const c = { x: engine.W / 2, y: engine.H / 2 };
      engine.collapse(c.x, c.y);
      await wait(650);
      stageSound.boom();
      engine.flash = 0.95;
      engine.flashCentre = [c.x, c.y];
      engine.shock = { x: c.x, y: c.y, r: 10, a: 0.9 };
      engine.burst(c.x, c.y, [10, 34]);
      engine.kMul = 0.08;
    }
    // Rebuild: the light lands on the outline of the real storefront.
    flushSync(() => {
      setLeaving(false);
      setScreen("live");
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const box = liveboxRef.current;
    if (box) {
      const rects: (StageRect & { fill: boolean })[] = [];
      const add = (selector: string, fill: boolean) => {
        box.querySelectorAll(selector).forEach((element) => {
          const r = rectOf(element);
          if (r && r.y < engine.H) rects.push({ ...r, fill });
        });
      };
      add("[data-stage-browser]", false);
      add("[data-stage-bar]", false);
      add("[data-stage-head]", false);
      add("[data-stage-hero]", true);
      add("[data-stage-brand]", true);
      add("[data-stage-signin]", true);
      add("[data-stage-course]", false);
      engine.form(
        engine.sampleRects(rects, Math.floor(engine.ps.length * 0.8)),
        {
          mix: 1,
          freeMix: 1,
        },
      );
    }
    if (!reducedRef.current) {
      const ramp = window.setInterval(() => {
        engine.kMul = Math.min(1, engine.kMul + 0.05);
        if (engine.kMul >= 1) window.clearInterval(ramp);
      }, 60);
    }
    await wait(1300);
    stageSound.chime();
    setLiveShown(true);
    engine.trails = false;
    await wait(900);
    // The light falls gently as confetti.
    engine.rain();
    dashboardButtonRef.current?.focus({ preventScroll: true });
  };

  const launch = async () => {
    if (launchingRef.current) return;
    launchingRef.current = true;
    setLaunching(true);
    try {
      if (mode === "signup") {
        // The academy is made before the countdown: if that fails, the
        // countdown never begins, and nothing runs twice.
        const made = await onboardingService.launch({
          name: name.trim(),
          slug,
          agreed: true,
        });
        setAcademy(made.academy);
        void queryClient.invalidateQueries({
          queryKey: onboardingKeys.state(),
        });
      }
      await playLaunch();
    } catch (error) {
      const problem = getApiError(error);
      showToast(
        problem.code === "ADDRESS_TAKEN"
          ? "Someone just took that address. Pick another and launch again."
          : problem.code === "ACADEMY_LIMIT"
            ? problem.message
            : "We couldn't launch just now. Everything is saved. Try again.",
        "error",
      );
      if (problem.code === "ADDRESS_TAKEN") {
        setAddressState("taken");
        checkAddress(slug);
        setScreen("details");
      }
    } finally {
      launchingRef.current = false;
      setLaunching(false);
    }
  };

  const replayLaunch = () => {
    const engine = engineRef.current;
    engine?.calm();
    setLiveShown(false);
    setLeaving(false);
    setPalette(STAGE_PALETTE);
    setScreen("launch");
    window.setTimeout(() => {
      if (!aliveRef.current) return;
      launchingRef.current = true;
      void playLaunch().finally(() => {
        launchingRef.current = false;
      });
    }, 700);
  };

  // ─── Live ───────────────────────────────────────────────────────────────

  const liveUrl = academyUrl(host);

  const openAcademy = async (target: OnboardingAcademy) => {
    setOpening(target.id);
    try {
      const { url } = await onboardingService.openAcademy(target.id);
      window.location.assign(url);
    } catch (error) {
      setOpening(null);
      showToast(getApiError(error).message, "error");
    }
  };

  const enterDashboard = async () => {
    if (mode === "replay") {
      void navigate("/");
      return;
    }
    if (!academy) return;
    setEntering(true);
    try {
      const { url } = await onboardingService.openAcademy(academy.id);
      window.location.assign(url);
    } catch (error) {
      setEntering(false);
      showToast(getApiError(error).message, "error");
    }
  };

  const copyLink = () => {
    void copyTextToClipboard(liveUrl).then((copied) =>
      showToast(copied ? "Link copied" : liveUrl, copied ? "ok" : "error"),
    );
  };

  const shareText = `${displayName} is live. Learn with me at ${liveUrl}`;
  const share = () => {
    if (canOpenShareSheet()) {
      void navigator
        .share({ title: displayName, text: shareText, url: liveUrl })
        .catch(() => undefined);
      return;
    }
    window.open(
      `https://wa.me/?text=${encodeURIComponent(shareText)}`,
      "_blank",
      "noopener",
    );
  };

  // ─── Navigation between screens ─────────────────────────────────────────

  const start = () => {
    stageSound.tick(740);
    if (currentUser) void afterSignIn();
    else setScreen("contact");
  };

  // Each screen's heading takes focus, so a screen reader says where we are.
  useEffect(() => {
    if (
      screen === "intro" ||
      screen === "contact" ||
      screen === "code" ||
      screen === "details"
    ) {
      return;
    }
    const heading = stageRef.current?.querySelector<HTMLElement>(
      "[data-stage-heading]",
    );
    heading?.focus({ preventScroll: true });
  }, [screen]);

  // ─── Render ─────────────────────────────────────────────────────────────

  const trialEnd = academy?.trialEndsAt
    ? new Date(academy.trialEndsAt)
    : new Date(Date.now() + TRIAL_DAYS * DAY_MS);
  const freeUntil = formatDate(trialEnd, { day: "numeric", month: "long" });
  const openedOn = formatDate(
    academy ? new Date(academy.createdAt) : new Date(),
    { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  );
  const googleEnabled = Boolean(authConfig?.googleClientId);

  const screenBody = (() => {
    switch (screen) {
      case "intro":
        return (
          <>
            {introLine ? (
              <p className="absolute right-0 bottom-[18%] left-0 z-2 px-5 text-center text-[clamp(16px,2cqw,22px)] font-semibold tracking-[-0.01em] text-(--text-secondary) animate-[stage-rise_1.2s_var(--stage-ease)_both] motion-reduce:animate-none">
                Every academy begins with a single spark.
              </p>
            ) : null}
            <button
              type="button"
              onClick={finishIntro}
              className={cn(
                stageGhostClasses,
                "absolute right-4.5 bottom-[max(18px,env(safe-area-inset-bottom,0px))] z-5",
              )}
            >
              Skip intro
              <ArrowRight size={14} weight="bold" aria-hidden="true" />
            </button>
          </>
        );
      case "home":
        return (
          <>
            <StageQuestion
              ref={questionRef}
              title={
                <>
                  Your academy
                  <br />
                  starts here.
                </>
              }
            >
              Courses, live classes and payments, under your own name. Free for
              14 days, no card needed.
            </StageQuestion>
            <StageArt ref={artRef} />
            <StageDock bare>
              <LaunchButton onClick={start} disabled={available === false}>
                <Sparkle size={22} weight="fill" aria-hidden="true" />
                Start your academy
              </LaunchButton>
              <p className="m-0 text-center text-[12.5px] leading-4.5 text-(--muted)">
                Already have an academy?{" "}
                <button
                  type="button"
                  onClick={() =>
                    currentUser ? void afterSignIn() : setScreen("contact")
                  }
                  className={cn(
                    "border-0 bg-transparent p-0 font-semibold text-(--text-secondary) underline underline-offset-2 hover:text-(--text)",
                    stageFocusClasses,
                  )}
                >
                  Sign in
                </button>{" "}
                · Here to learn?{" "}
                <button
                  type="button"
                  onClick={() =>
                    showToast(
                      "Students sign in on their academy’s own site, like procodrr.veolms.app",
                    )
                  }
                  className={cn(
                    "border-0 bg-transparent p-0 font-semibold text-(--text-secondary) underline underline-offset-2 hover:text-(--text)",
                    stageFocusClasses,
                  )}
                >
                  Find your academy
                </button>
              </p>
            </StageDock>
          </>
        );
      case "unavailable":
        return (
          <>
            <StageQuestion
              ref={questionRef}
              title="New academies start on VeoLMS."
            >
              This site doesn&rsquo;t open new academies. Its own courses are on
              its home page.
            </StageQuestion>
            <StageArt ref={artRef} />
            <StageDock>
              <Button onClick={() => void navigate("/")} className="h-11.5">
                Go to the home page
                <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </Button>
            </StageDock>
          </>
        );
      case "contact":
        return (
          <ContactScreen
            questionRef={questionRef}
            artRef={artRef}
            method={method}
            // Creators sign up with an email or a mobile number, whichever
            // they use, whatever the academies' own sign-in allows.
            showMethodSwitch
            onMethodChange={(next) => {
              setMethod(next);
              setContactError(null);
            }}
            email={email}
            onEmailChange={onEmailChange}
            mobile={phone}
            onMobileChange={onMobileChange}
            country={country}
            onCountryChange={(next) => {
              setCountry(next);
              setContactError(null);
            }}
            error={contactError}
            sending={sending}
            onSubmit={() => void submitContact()}
            google={
              googleEnabled
                ? { busy: googleBusy, onClick: () => void signInWithGoogle() }
                : null
            }
          />
        );
      case "code":
        return (
          <CodeScreen
            questionRef={questionRef}
            artRef={artRef}
            sentTo={sentTo}
            code={code}
            onCodeChange={onCodeChange}
            error={codeError}
            checking={checking}
            onSubmit={() => void verifyCode()}
            onBack={() => setScreen("contact")}
            resend={{ busy: sending, onClick: () => void resendCode() }}
          />
        );
      case "welcome":
        return (
          <WelcomeScreen
            questionRef={questionRef}
            artRef={artRef}
            academies={platform?.academies ?? []}
            opening={opening}
            canStartAnother={
              (platform?.academies.length ?? 0) < (platform?.maxAcademies ?? 3)
            }
            maxAcademies={platform?.maxAcademies ?? 3}
            onOpen={(target) => void openAcademy(target)}
            onStartAnother={startNew}
          />
        );
      case "details":
        return (
          <DetailsScreen
            questionRef={questionRef}
            artRef={artRef}
            name={name}
            onNameChange={onNameChange}
            slug={slug}
            onSlugChange={onSlugChange}
            domain={domain}
            addressState={addressState}
            suggestions={suggestions}
            onPickSuggestion={(next) => {
              setSlug(next);
              setSlugEdited(true);
              checkAddress(next);
            }}
            agreed={agreed}
            onAgreedChange={setAgreed}
            saving={savingDraft}
            error={detailsError}
            canContinue={canContinue}
            onBack={() =>
              setScreen(
                (platform?.academies.length ?? 0) > 0 ? "welcome" : "home",
              )
            }
            onContinue={() => void continueToLaunch()}
          />
        );
      case "launch":
        return (
          <LaunchScreen
            questionRef={questionRef}
            artRef={artRef}
            name={displayName}
            host={host}
            freeUntil={freeUntil}
            launching={launching}
            leaving={leaving}
            launchRef={launchButtonRef}
            onBack={mode === "signup" ? () => setScreen("details") : null}
            onLaunch={() => void launch()}
          />
        );
      case "live":
        return (
          <LiveScreen
            questionRef={questionRef}
            liveboxRef={liveboxRef}
            name={displayName}
            host={host}
            openedOn={openedOn}
            shown={liveShown}
            entering={entering}
            dashboardRef={dashboardButtonRef}
            onEnter={() => void enterDashboard()}
            onCopy={copyLink}
            onShare={share}
            shareLabel={canOpenShareSheet() ? "share" : "whatsapp"}
            onReplay={replayLaunch}
          />
        );
    }
  })();

  // Waiting for the site to say whether it takes sign-ups: the home screen
  // then shows either the start or a way back.
  useEffect(() => {
    if (screen === "home" && available === false) setScreen("unavailable");
  }, [screen, available]);

  return (
    <div
      ref={stageRef}
      className={cn(
        "@container relative h-dvh w-full overflow-hidden text-(--text) [--stage-ease:cubic-bezier(.16,1,.3,1)]",
        // veolms.org's own colours (its near-black and neon) until the
        // launch, when the new academy's colour arrives.
        mode === "signup" &&
          palette === STAGE_PALETTE &&
          "[--accent-border:rgba(217,255,0,0.4)] [--accent-hover:#e5ff33] [--accent-soft:rgba(217,255,0,0.14)] [--accent:#d9ff00] [--canvas:#080809] [--on-accent:#080809]",
        "bg-[radial-gradient(120%_90%_at_50%_38%,color-mix(in_srgb,var(--accent)_9%,var(--canvas))_0%,var(--canvas)_55%,color-mix(in_srgb,#000_35%,var(--canvas))_100%)]",
        "[:root[data-theme=light]_&]:bg-[radial-gradient(120%_90%_at_50%_38%,color-mix(in_srgb,var(--accent)_7%,var(--surface))_0%,var(--canvas)_70%)]",
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 block size-full"
      />
      <main
        key={screen}
        className="absolute inset-0 flex flex-col"
        aria-live="off"
      >
        {screen !== "intro" ? (
          <StageTopBar progress={PROGRESS[screen]} hidden={leaving} />
        ) : null}
        {screenBody}
      </main>
      {countdown ? (
        <div className="pointer-events-none absolute inset-0 z-2 grid items-end justify-items-center pb-[12vh]">
          <span className="text-[13px] font-extrabold tracking-[0.3em] text-(--muted) uppercase animate-[stage-rise_.6s_var(--stage-ease)_both]">
            Going live
          </span>
        </div>
      ) : null}
      <StageToast message={toast} />
    </div>
  );
}
