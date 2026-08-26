import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect } from "react";
import { createCommentEditorExtensions } from "./commentEditor";

interface RichTextContentProps {
  content: JSONContent;
  fallback: string;
  label: string;
  className?: string;
}

export function RichTextContent({
  content,
  fallback,
  label,
  className = "",
}: RichTextContentProps) {
  const editor = useEditor({
    extensions: createCommentEditorExtensions(),
    content,
    editable: false,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        "aria-label": label,
        class: "learning-rich-text-document",
        role: "document",
        tabindex: "-1",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (JSON.stringify(editor.getJSON()) === JSON.stringify(content)) return;
    editor.commands.setContent(content, { emitUpdate: false });
  }, [content, editor]);

  if (!editor) {
    return (
      <p
        className={`text-sm leading-6 text-(--text-secondary) sm:text-[15px] ${className}`}
      >
        {fallback}
      </p>
    );
  }

  return (
    <EditorContent
      editor={editor}
      className={`learning-rich-text-content ${className}`}
    />
  );
}
