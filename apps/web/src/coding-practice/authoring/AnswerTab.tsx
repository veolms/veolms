import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import type { CodingFile } from "@veolms/contracts";
import { Button } from "../../components/Button";
import { answerFromStarter } from "./answer";
import { FilesEditor } from "./FilesEditor";
import type { ExerciseForm } from "./useExerciseForm";

/**
 * The Answer tab: the author writes a correct answer here instead of in
 * the starter code. Only staff see it; it proves the tests accept a right
 * answer (Try it, Check tests and Publish run them on it).
 */
export function AnswerTab({
  form,
  onChange,
}: {
  form: ExerciseForm;
  onChange: (files: CodingFile[]) => void;
}) {
  return (
    <div className="grid gap-3">
      <p className="flex items-start gap-2 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-3.5 py-2.5 text-sm text-(--text-secondary)">
        <LockSimple
          size={16}
          weight="bold"
          className="mt-0.5 shrink-0 text-(--text)"
          aria-hidden="true"
        />
        <span>
          <strong className="text-(--text)">Only you see this.</strong> Write a
          correct answer here, not in the starter code. Your tests must pass on
          it and fail on the starter code; learners never receive it.
        </span>
      </p>
      {form.solutionFiles.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[color-mix(in_srgb,var(--text)_3.5%,transparent)] px-4 py-6">
          <p className="text-sm text-(--text-secondary)">
            No answer yet. Start from a copy of the starter code and complete
            it.
          </p>
          <Button onClick={() => onChange(answerFromStarter(form))}>
            Write the answer
          </Button>
        </div>
      ) : (
        <FilesEditor
          files={form.solutionFiles}
          onChange={onChange}
          withFlags={false}
          label="Answer files"
        />
      )}
    </div>
  );
}
