import { useState } from "react";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import type { CodingFile } from "@veolms/contracts";
import { CODING_LIMITS } from "@veolms/contracts";
import { Checkbox } from "../../components/Checkbox";
import { CodeEditor, languageForPath } from "../editor/CodeEditor";
import { FIELD, FOCUS_RING, HAIRLINE, IconAction, MONO } from "../shared/ui";

const PATH_PATTERN = /^(?!\/)(?!.*\.\.)[A-Za-z0-9_\-./]+$/;

/**
 * A set of files: tabs, add, rename, remove, and (for the starter) whether
 * a file is read-only for learners or hidden from them.
 */
export function FilesEditor({
  files,
  onChange,
  withFlags,
  label,
}: {
  files: CodingFile[];
  onChange: (files: CodingFile[]) => void;
  withFlags: boolean;
  label: string;
}) {
  const [active, setActive] = useState(files[0]?.path ?? "");
  const [newPath, setNewPath] = useState("");
  const [pathError, setPathError] = useState<string | null>(null);
  const file = files.find((item) => item.path === active) ?? files[0];

  const addFile = () => {
    const path = newPath.trim();
    if (!PATH_PATTERN.test(path)) {
      setPathError("Use a name like helpers.js or styles/main.css.");
      return;
    }
    if (files.some((item) => item.path === path)) {
      setPathError(`${path} already exists.`);
      return;
    }
    if (files.length >= CODING_LIMITS.maxFiles) {
      setPathError(`At most ${CODING_LIMITS.maxFiles} files.`);
      return;
    }
    onChange([...files, { path, content: "" }]);
    setActive(path);
    setNewPath("");
    setPathError(null);
  };

  return (
    <div className={`overflow-hidden rounded-xl border ${HAIRLINE}`}>
      <div
        className={`flex flex-wrap items-center gap-1 border-b px-2 py-1.5 ${HAIRLINE}`}
        role="tablist"
        aria-label={`${label} files`}
      >
        {files.map((item) => (
          <button
            key={item.path}
            type="button"
            role="tab"
            aria-selected={item.path === file?.path}
            onClick={() => setActive(item.path)}
            className={`inline-flex h-8 cursor-pointer items-center rounded-md px-2.5 text-[0.8125rem]! font-semibold! font-mono! ${FOCUS_RING} ${
              item.path === file?.path
                ? "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--text)"
                : "text-(--text-secondary) hover:bg-(--hover)"
            }`}
          >
            {item.path}
            {item.hidden ? (
              <span className="ml-1 text-[0.6875rem] font-normal text-(--muted)">
                hidden
              </span>
            ) : null}
            {item.readOnly ? (
              <span className="ml-1 text-[0.6875rem] font-normal text-(--muted)">
                read-only
              </span>
            ) : null}
          </button>
        ))}
        <form
          className="ml-auto flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            addFile();
          }}
        >
          <input
            value={newPath}
            onChange={(event) => setNewPath(event.target.value)}
            placeholder="new-file.js"
            aria-label="New file name"
            className={`${FIELD} h-8 w-36 font-mono! sm:text-xs!`}
          />
          <IconAction label="Add the file" onClick={addFile}>
            <Plus size={16} weight="bold" aria-hidden="true" />
          </IconAction>
        </form>
      </div>
      {pathError ? (
        <p role="alert" className="px-3 pt-2 text-xs text-rose-500">
          {pathError}
        </p>
      ) : null}
      {file ? (
        <>
          {withFlags || files.length > 1 ? (
            <div
              className={`flex flex-wrap items-center gap-x-5 gap-y-2 border-b px-3 py-2 ${HAIRLINE}`}
            >
              {withFlags ? (
                <>
                  <Checkbox
                    checked={Boolean(file.readOnly)}
                    onCheckedChange={(checked) =>
                      onChange(
                        files.map((item) =>
                          item.path === file.path
                            ? {
                                ...item,
                                readOnly: checked || undefined,
                                hidden: checked ? undefined : item.hidden,
                              }
                            : item,
                        ),
                      )
                    }
                    label="Read-only for learners"
                  />
                  <Checkbox
                    checked={Boolean(file.hidden)}
                    onCheckedChange={(checked) =>
                      onChange(
                        files.map((item) =>
                          item.path === file.path
                            ? {
                                ...item,
                                hidden: checked || undefined,
                                readOnly: checked ? undefined : item.readOnly,
                              }
                            : item,
                        ),
                      )
                    }
                    label="Hidden (used by tests only)"
                  />
                </>
              ) : null}
              {files.length > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    const rest = files.filter(
                      (item) => item.path !== file.path,
                    );
                    onChange(rest);
                    setActive(rest[0]?.path ?? "");
                  }}
                  className={`ml-auto inline-flex cursor-pointer items-center gap-1 rounded text-xs! font-semibold! text-rose-500 ${FOCUS_RING}`}
                >
                  <Trash size={13} aria-hidden="true" />
                  Remove {file.path}
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="h-80">
            <CodeEditor
              key={file.path}
              value={file.content}
              onChange={(content) =>
                onChange(
                  files.map((item) =>
                    item.path === file.path ? { ...item, content } : item,
                  ),
                )
              }
              language={languageForPath(file.path)}
              label={`${label}, ${file.path}`}
            />
          </div>
        </>
      ) : (
        <p className="px-3 py-6 text-sm text-(--muted)">Add a file to start.</p>
      )}
    </div>
  );
}
