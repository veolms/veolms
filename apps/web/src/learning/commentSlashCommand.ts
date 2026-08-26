import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import {
  CommentBlockMenu,
  type CommentBlockMenuHandle,
} from "./CommentBlockMenu";
import {
  COMMENT_BLOCK_COMMANDS,
  filterCommentBlockCommands,
  runCommentBlockCommand,
  type CommentBlockCommand,
} from "./commentBlockCommands";

const commentSlashCommandPluginKey = new PluginKey("commentSlashCommand");

interface SlashMenuRendererProps {
  items: readonly CommentBlockCommand[];
  query: string;
  title: string;
  onSelect: (command: CommentBlockCommand) => void;
}

export const CommentSlashCommand = Extension.create({
  name: "commentSlashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion<CommentBlockCommand, CommentBlockCommand>({
        editor: this.editor,
        pluginKey: commentSlashCommandPluginKey,
        char: "/",
        startOfLine: true,
        allowedPrefixes: null,
        decorationClass: "learning-comment-editor__slash-trigger",
        initialItems: [...COMMENT_BLOCK_COMMANDS],
        offset: { mainAxis: 8, crossAxis: -12 },
        allow: ({ state, range }) =>
          state.doc.resolve(range.from).parent.type.name === "paragraph",
        items: ({ query }) => [...filterCommentBlockCommands(query)],
        command: ({ editor, range, props }) => {
          runCommentBlockCommand({
            editor,
            range,
            commandId: props.id,
          });
        },
        render: () => {
          let renderer: ReactRenderer<
            CommentBlockMenuHandle,
            SlashMenuRendererProps
          > | null = null;
          let unmount: (() => void) | undefined;

          return {
            onStart: (props) => {
              renderer = new ReactRenderer<
                CommentBlockMenuHandle,
                SlashMenuRendererProps
              >(CommentBlockMenu, {
                editor: props.editor,
                className: "z-220",
                props: {
                  items: props.items,
                  query: props.query,
                  title: "Turn into",
                  onSelect: props.command,
                },
              });
              unmount = props.mount(renderer.element);
            },
            onUpdate: (props) => {
              renderer?.updateProps({
                items: props.items,
                query: props.query,
                title: "Turn into",
                onSelect: props.command,
              });
            },
            onKeyDown: ({ event }) => renderer?.ref?.onKeyDown(event) ?? false,
            onExit: () => {
              unmount?.();
              renderer?.destroy();
              unmount = undefined;
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
