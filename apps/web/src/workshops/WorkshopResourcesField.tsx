import type { WorkshopResource } from "@veolms/contracts";
import { LinkIcon as Link } from "@phosphor-icons/react/Link";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { Button } from "../components/Button";
import { fieldClass } from "./workshopHelpers";

export interface ResourceDraft extends WorkshopResource {
  key: string;
}

export function newResourceDraft(): ResourceDraft {
  return { key: crypto.randomUUID(), title: "", url: "" };
}

/** Links shown with the workshop: slides, a repo, reading. Files come later. */
export function WorkshopResourcesField({
  resources,
  onChange,
  disabled = false,
}: {
  resources: ResourceDraft[];
  onChange: (resources: ResourceDraft[]) => void;
  disabled?: boolean;
}) {
  const update = (key: string, patch: Partial<WorkshopResource>) =>
    onChange(
      resources.map((resource) =>
        resource.key === key ? { ...resource, ...patch } : resource,
      ),
    );

  return (
    <div className="grid gap-3">
      {resources.length === 0 ? (
        <p className="text-[13px] text-(--muted)">
          No links yet. Add slides, a repository or anything learners should
          open before or after the session.
        </p>
      ) : null}
      {resources.map((resource) => (
        <div
          key={resource.key}
          className="grid gap-2 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] sm:items-center"
        >
          <input
            type="text"
            value={resource.title}
            onChange={(event) =>
              update(resource.key, { title: event.target.value })
            }
            placeholder="Title, like Slides"
            maxLength={120}
            disabled={disabled}
            aria-label="Resource title"
            className={`${fieldClass} w-full`}
          />
          <div className={`${fieldClass} flex w-full items-center gap-2`}>
            <Link size={16} className="shrink-0 text-(--muted)" />
            <input
              type="url"
              value={resource.url}
              onChange={(event) =>
                update(resource.key, { url: event.target.value })
              }
              placeholder="https://"
              maxLength={2048}
              disabled={disabled}
              aria-label="Resource link"
              className="w-full min-w-0 border-0 bg-transparent outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              onChange(resources.filter((item) => item.key !== resource.key))
            }
            disabled={disabled}
            aria-label="Remove resource"
            className="inline-flex h-11 w-11 items-center justify-center justify-self-end rounded-xl text-(--muted) hover:bg-rose-500/10 hover:text-rose-500 cursor-pointer disabled:opacity-50"
          >
            <Trash size={18} />
          </button>
        </div>
      ))}
      <div>
        <Button
          variant="quiet"
          elevation="flat"
          disabled={disabled || resources.length >= 20}
          onClick={() => onChange([...resources, newResourceDraft()])}
        >
          <Plus size={16} weight="bold" />
          Add link
        </Button>
      </div>
    </div>
  );
}
