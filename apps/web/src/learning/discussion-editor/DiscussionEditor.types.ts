import type {
  DiscussionEditorCommands,
  DiscussionFormattingState,
} from "./commands";
import type { DiscussionDraft } from "./types";

export interface DiscussionEditorController extends DiscussionEditorCommands {
  attach(file: File): Promise<{ inserted: boolean; message: string | null }>;
  getMarkdown(): string;
}

export interface DiscussionEditorProps {
  value: DiscussionDraft;
  documentId: string;
  label: string;
  placeholderText: string;
  invalid?: boolean;
  autoFocus?: boolean;
  autoGrow?: boolean;
  className?: string;
  onChange: (draft: DiscussionDraft) => void;
  onControllerChange?: (controller: DiscussionEditorController | null) => void;
  onFormattingStateChange?: (state: DiscussionFormattingState) => void;
  onAttachmentNotice?: (message: string | null) => void;
}
