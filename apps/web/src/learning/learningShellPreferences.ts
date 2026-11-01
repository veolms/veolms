import {
  SPLIT_FRAME_DEFAULT_WIDTH,
  SPLIT_FRAME_MAX_WIDTH,
  SPLIT_FRAME_MIN_WIDTH,
  getSplitFramePrerenderedScript,
} from "../components/splitFrame";

export const CURRICULUM_COLLAPSED_WIDTH = 0;
export const CURRICULUM_MIN_WIDTH = SPLIT_FRAME_MIN_WIDTH;
export const CURRICULUM_DEFAULT_WIDTH = SPLIT_FRAME_DEFAULT_WIDTH;
export const CURRICULUM_MAX_WIDTH = SPLIT_FRAME_MAX_WIDTH;
/** Where the course content is a card beside the lesson (SplitFramePane). */
export const LEARNING_SPLIT_MEDIA = "(min-width: 1081px)";
export const CURRICULUM_WIDTH_STORAGE_KEY = "veolms-curriculum-width";
export const CURRICULUM_COLLAPSED_STORAGE_KEY = "veolms-curriculum-collapsed";

export interface LearningShellState {
  curriculumCollapsed: boolean;
  curriculumWidth: number;
}

export const clampLearningCurriculumWidth = (value: number) =>
  Math.min(CURRICULUM_MAX_WIDTH, Math.max(CURRICULUM_MIN_WIDTH, value));

export const applyLearningShellToDocument = (state: LearningShellState) => {
  const root = document.documentElement;
  const width = state.curriculumCollapsed
    ? CURRICULUM_COLLAPSED_WIDTH
    : state.curriculumWidth;
  root.dataset.learningCurriculumState = state.curriculumCollapsed
    ? "collapsed"
    : "expanded";
  root.style.setProperty("--learning-curriculum-width", `${width}px`);
  root.style.setProperty(
    "--learning-curriculum-expanded-width",
    `${state.curriculumWidth}px`,
  );
  window.__VEO_BOOTSTRAP__ = {
    ...window.__VEO_BOOTSTRAP__,
    learning: state,
  };
};

export const getInitialLearningShellState = (): LearningShellState => {
  if (typeof window === "undefined") {
    return {
      curriculumCollapsed: false,
      curriculumWidth: CURRICULUM_DEFAULT_WIDTH,
    };
  }

  const bootstrapState = window.__VEO_BOOTSTRAP__?.learning;
  if (
    bootstrapState &&
    typeof bootstrapState.curriculumCollapsed === "boolean" &&
    Number.isFinite(bootstrapState.curriculumWidth)
  ) {
    return {
      curriculumCollapsed: bootstrapState.curriculumCollapsed,
      curriculumWidth: clampLearningCurriculumWidth(
        bootstrapState.curriculumWidth,
      ),
    };
  }

  try {
    const storedWidth = window.localStorage.getItem(
      CURRICULUM_WIDTH_STORAGE_KEY,
    );
    const parsedWidth = Number(storedWidth);

    return {
      curriculumCollapsed:
        window.localStorage.getItem(CURRICULUM_COLLAPSED_STORAGE_KEY) ===
        "true",
      curriculumWidth:
        storedWidth !== null &&
        storedWidth.trim() !== "" &&
        Number.isFinite(parsedWidth)
          ? clampLearningCurriculumWidth(parsedWidth)
          : CURRICULUM_DEFAULT_WIDTH,
    };
  } catch {
    return {
      curriculumCollapsed: false,
      curriculumWidth: CURRICULUM_DEFAULT_WIDTH,
    };
  }
};

export const getLearningShellBootstrapScript = () =>
  `(()=>{const r=document.documentElement;${getSplitFramePrerenderedScript(LEARNING_SPLIT_MEDIA)}const d=${CURRICULUM_DEFAULT_WIDTH},n=${CURRICULUM_MIN_WIDTH},x=${CURRICULUM_MAX_WIDTH};let w=d,c=false;try{const s=localStorage.getItem(${JSON.stringify(CURRICULUM_WIDTH_STORAGE_KEY)}),v=Number(s);if(s!==null&&s.trim()&&Number.isFinite(v))w=Math.min(x,Math.max(n,v));c=localStorage.getItem(${JSON.stringify(CURRICULUM_COLLAPSED_STORAGE_KEY)})==="true"}catch{}const l={curriculumCollapsed:c,curriculumWidth:w};window.__VEO_BOOTSTRAP__={...window.__VEO_BOOTSTRAP__,learning:l};r.dataset.learningCurriculumState=c?"collapsed":"expanded";r.style.setProperty("--learning-curriculum-width",(c?0:w)+"px");r.style.setProperty("--learning-curriculum-expanded-width",w+"px")})();`;
