import { QuizAuthoringPanel } from "./QuizAuthoringPanel";

interface Props {
  quizId?: string;
  onNavigatePage?: (destination: string) => void;
}

export function QuizBuilderPage({ quizId, onNavigatePage }: Props) {
  const createNew = !quizId;
  return (
    <main
      data-quiz-surface=""
      className="mx-auto w-full max-w-[1320px] px-0 py-0.5 sm:px-4 sm:py-6 lg:px-8"
    >
      <QuizAuthoringPanel
        initialQuizId={quizId ?? null}
        createNew={createNew}
        onBack={() => onNavigatePage?.("/quizzes")}
      />
    </main>
  );
}
