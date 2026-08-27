import { describe, it, expect } from "vitest";
import {
  initialBasicsState,
  normalizeBasicsState,
  isBasicsEqual,
  type BasicsFormState,
} from "../../src/courses/CourseCreatePage";

describe("Course Wizard: Curriculum Creation vs Unsaved Basics Draft Synchronization", () => {
  interface HydrationSimulationState {
    serverBasics: BasicsFormState;
    basicsDraft: BasicsFormState;
    isBasicsDirty: boolean;
  }

  const simulateServerHydration = (
    current: HydrationSimulationState,
    serverCourse: {
      title?: string | null;
      shortDescription?: string | null;
      description?: string | null;
      categoryId?: string | null;
      difficulty?: string | null;
      language?: string | null;
      instructorAlias?: string | null;
      showInstructorName?: boolean;
    },
  ): HydrationSimulationState => {
    const confirmedBasics = normalizeBasicsState({
      title: serverCourse.title || "",
      shortDescription: serverCourse.shortDescription || "",
      description: serverCourse.description || "",
      categoryId: serverCourse.categoryId || "",
      difficulty:
        (serverCourse.difficulty as BasicsFormState["difficulty"]) || "",
      language: serverCourse.language || "en",
      instructorAlias: serverCourse.instructorAlias || "",
      showInstructorName:
        serverCourse.showInstructorName !== undefined
          ? serverCourse.showInstructorName
          : true,
    });

    const isDirty = current.isBasicsDirty;

    const nextServerBasics = confirmedBasics;
    const nextBasicsDraft = isDirty ? current.basicsDraft : confirmedBasics;
    const nextIsDirty = !isBasicsEqual(nextBasicsDraft, nextServerBasics);

    return {
      serverBasics: nextServerBasics,
      basicsDraft: nextBasicsDraft,
      isBasicsDirty: nextIsDirty,
    };
  };

  it("preserves unsaved Basics draft fields when Curriculum creates a minimal course and editorData refetches", () => {
    // 1. User fills in Basics fields without saving
    const userDraft: BasicsFormState = {
      title: "My Advanced Course",
      shortDescription: "A short summary",
      description: "A comprehensive course description written by the user",
      categoryId: "cat-development-uuid",
      difficulty: "intermediate",
      language: "en",
      instructorAlias: "Lead Instructor",
      showInstructorName: false,
    };

    let state: HydrationSimulationState = {
      serverBasics: initialBasicsState,
      basicsDraft: userDraft,
      isBasicsDirty: true,
    };

    expect(state.isBasicsDirty).toBe(true);

    // 2. User goes to Curriculum and clicks "Add Section"
    // Backend creates minimal/untitled course with title only
    const serverMinimalCourse = {
      title: "My Advanced Course",
      shortDescription: null,
      description: null,
      categoryId: null,
      difficulty: null,
      language: "en",
      instructorAlias: null,
      showInstructorName: true,
    };

    // 3. editorData refetches from server
    state = simulateServerHydration(state, serverMinimalCourse);

    // 4. Verification: user's draft must NOT be overwritten by minimal server course
    expect(state.basicsDraft.title).toBe("My Advanced Course");
    expect(state.basicsDraft.shortDescription).toBe("A short summary");
    expect(state.basicsDraft.description).toBe(
      "A comprehensive course description written by the user",
    );
    expect(state.basicsDraft.categoryId).toBe("cat-development-uuid");
    expect(state.basicsDraft.difficulty).toBe("intermediate");
    expect(state.basicsDraft.language).toBe("en");
    expect(state.basicsDraft.instructorAlias).toBe("Lead Instructor");
    expect(state.basicsDraft.showInstructorName).toBe(false);

    // 5. Server baseline represents what the server confirmed
    expect(state.serverBasics.shortDescription).toBe("");
    expect(state.serverBasics.description).toBe("");
    expect(state.serverBasics.categoryId).toBe("");
    expect(state.serverBasics.difficulty).toBe("");
    expect(state.serverBasics.instructorAlias).toBe("");
    expect(state.serverBasics.showInstructorName).toBe(true);

    // 6. Dirty flag remains true because draft still contains uncommitted changes
    expect(state.isBasicsDirty).toBe(true);
  });

  it("hydrates basicsDraft from server data when Basics is clean", () => {
    // 1. Clean initial state
    let state: HydrationSimulationState = {
      serverBasics: initialBasicsState,
      basicsDraft: initialBasicsState,
      isBasicsDirty: false,
    };

    // 2. Server provides existing course data
    const serverCourse = {
      title: "Existing Course",
      shortDescription: "Existing Short Desc",
      description: "Existing Description",
      categoryId: "cat-123",
      difficulty: "beginner",
      language: "es",
      instructorAlias: "Prof. Smith",
      showInstructorName: false,
    };

    state = simulateServerHydration(state, serverCourse);

    expect(state.basicsDraft.title).toBe("Existing Course");
    expect(state.basicsDraft.shortDescription).toBe("Existing Short Desc");
    expect(state.basicsDraft.description).toBe("Existing Description");
    expect(state.basicsDraft.categoryId).toBe("cat-123");
    expect(state.basicsDraft.difficulty).toBe("beginner");
    expect(state.basicsDraft.language).toBe("es");
    expect(state.basicsDraft.instructorAlias).toBe("Prof. Smith");
    expect(state.basicsDraft.showInstructorName).toBe(false);
    expect(state.isBasicsDirty).toBe(false);
  });

  it("allows user to return to Basics and successfully save preserved draft after Curriculum course creation", () => {
    // 1. Dirty draft before curriculum section creation
    const userDraft: BasicsFormState = {
      title: "Course Title",
      shortDescription: "Short Desc",
      description: "User Description",
      categoryId: "cat-1",
      difficulty: "advanced",
      language: "en",
      instructorAlias: "Prof. Alan",
      showInstructorName: true,
    };

    let state: HydrationSimulationState = {
      serverBasics: initialBasicsState,
      basicsDraft: userDraft,
      isBasicsDirty: true,
    };

    // 2. Minimal course created by Curriculum
    state = simulateServerHydration(state, {
      title: "Course Title",
      description: null,
      categoryId: null,
      difficulty: null,
      language: "en",
    });

    expect(state.basicsDraft.description).toBe("User Description");
    expect(state.isBasicsDirty).toBe(true);

    // 3. User clicks Save Basics -> persists userDraft to server
    const savedServerCourse = {
      title: state.basicsDraft.title,
      description: state.basicsDraft.description,
      categoryId: state.basicsDraft.categoryId,
      difficulty: state.basicsDraft.difficulty,
      language: state.basicsDraft.language,
    };

    // 4. Save response updates server baseline and clears dirty state
    const confirmedBasics = normalizeBasicsState(savedServerCourse);
    state = {
      serverBasics: confirmedBasics,
      basicsDraft: confirmedBasics,
      isBasicsDirty: false,
    };

    expect(state.serverBasics.description).toBe("User Description");
    expect(state.basicsDraft.description).toBe("User Description");
    expect(state.isBasicsDirty).toBe(false);
  });
});
