export const CURRICULUM_COLLAPSED_WIDTH = 0;
export const CURRICULUM_MIN_WIDTH = 300;
export const CURRICULUM_DEFAULT_WIDTH = 400;
export const CURRICULUM_MAX_WIDTH = 560;
export const CURRICULUM_WIDTH_STORAGE_KEY = "veolms-curriculum-width";
export const CURRICULUM_COLLAPSED_STORAGE_KEY = "veolms-curriculum-collapsed";

export interface LearningShellState {
  curriculumCollapsed: boolean;
  curriculumWidth: number;
}

export const clampLearningCurriculumWidth = (value: number) =>
  Math.min(CURRICULUM_MAX_WIDTH, Math.max(CURRICULUM_MIN_WIDTH, value));

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
  `(()=>{const r=document.documentElement,d=${CURRICULUM_DEFAULT_WIDTH},n=${CURRICULUM_MIN_WIDTH},x=${CURRICULUM_MAX_WIDTH};let w=d,c=false;try{const s=localStorage.getItem(${JSON.stringify(CURRICULUM_WIDTH_STORAGE_KEY)}),v=Number(s);if(s!==null&&s.trim()&&Number.isFinite(v))w=Math.min(x,Math.max(n,v));c=localStorage.getItem(${JSON.stringify(CURRICULUM_COLLAPSED_STORAGE_KEY)})==="true"}catch{}const l={curriculumCollapsed:c,curriculumWidth:w},v=c?0:w;window.__VEO_BOOTSTRAP__={...window.__VEO_BOOTSTRAP__,learning:l};r.dataset.learningCurriculumState=c?"collapsed":"expanded";r.style.setProperty("--learning-curriculum-width",v+"px");r.style.setProperty("--learning-curriculum-expanded-width",w+"px");if(!location.pathname.startsWith("/learn/"))return;const a=()=>{const m=document.querySelector(".learning-workspace__main"),o=document.querySelector(".learning-workspace__curriculum-column");if(!m||!o)return false;m.classList.toggle("is-curriculum-collapsed",c);o.classList.toggle("is-collapsed",c);m.style.setProperty("--learning-curriculum-width",v+"px");m.style.setProperty("--learning-curriculum-expanded-width",w+"px");return true};if(!a()&&document.readyState==="loading"){const o=new MutationObserver(()=>{if(a())o.disconnect()});o.observe(document,{childList:true,subtree:true});document.addEventListener("DOMContentLoaded",()=>o.disconnect(),{once:true})}})();`;
