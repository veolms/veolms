import type { Dispatch, SetStateAction } from "react";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { UseMutationResult } from "@tanstack/react-query";
import type { ApiError } from "../../lib/api-error";
import { useCapabilities } from "../../services/authorization/authorization.queries";

export interface CourseCategoriesModalProps {
  handleCloseAddCategoryModal: () => void;
  handleCreateCategory: (e?: React.FormEvent) => Promise<void>;
  newCategoryName: string;
  setNewCategoryName: Dispatch<SetStateAction<string>>;
  addCategoryError: string;
  setAddCategoryError: Dispatch<SetStateAction<string>>;
  createCategoryMutation: UseMutationResult<
    { id: string; name: string; slug: string },
    ApiError,
    { name: string },
    unknown
  >;
  serverCategories: { id: string; name: string; slug: string }[];
  isLoadingCategories: boolean;
  setCategoryToDelete: Dispatch<
    SetStateAction<{ id: string; name: string } | null>
  >;
  deleteCategoryMutation: UseMutationResult<
    { success: boolean },
    ApiError,
    string,
    unknown
  >;
}

export function CourseCategoriesModal({
  handleCloseAddCategoryModal,
  handleCreateCategory,
  newCategoryName,
  setNewCategoryName,
  addCategoryError,
  setAddCategoryError,
  createCategoryMutation,
  serverCategories,
  isLoadingCategories,
  setCategoryToDelete,
  deleteCategoryMutation,
}: CourseCategoriesModalProps) {
  // Removing a category affects every course; it takes category.manage.
  const managesCategories = useCapabilities().canOnCourse(
    "category.manage",
    null,
  );
  // prettier-ignore
  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 [animation:deleteModalFadeIn_0.18s_ease-out]"
      onClick={handleCloseAddCategoryModal}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-category-modal-title"
    >
      <div
        className="relative w-full max-w-[460px] rounded-[16px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--surface) p-6 shadow-[0_20px_48px_rgba(0,0,0,0.45)] [animation:deleteModalPopIn_0.22s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3
              id="add-category-modal-title"
              className="m-0 text-(--text) text-[1.1rem] font-bold tracking-tight"
            >
              Manage Categories
            </h3>
            <p className="m-0 mt-0.5 text-(--muted) text-[0.78rem]">
              Create new categories or remove existing ones.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex w-7 h-7 items-center justify-center rounded-[8px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--muted) hover:text-(--text) hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] transition-colors duration-150 bg-transparent cursor-pointer p-0 shrink-0"
            onClick={handleCloseAddCategoryModal}
            aria-label="Close modal"
          >
            <X size={15} />
          </button>
        </div>

        {/* Add New Category Form */}
        <form
          onSubmit={handleCreateCategory}
          className="flex flex-col gap-3 pb-4 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
        >
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="new-category-name-input"
              className="text-(--text-secondary) text-[0.82rem] font-semibold"
            >
              Add New Category{" "}
              <span className="text-[#ff5252] ml-0.5">*</span>
            </label>
            <div className="flex gap-2">
              <input
                id="new-category-name-input"
                type="text"
                autoFocus
                value={newCategoryName}
                onChange={(e) => {
                  setNewCategoryName(e.target.value);
                  if (addCategoryError) setAddCategoryError("");
                }}
                placeholder="e.g. Mobile Development"
                maxLength={100}
                className="flex-1 h-10 px-3 rounded-[9px] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-(--text) text-[0.88rem] focus:outline-none focus:border-(--accent) transition-colors placeholder:text-(--muted)"
              />
              <button
                type="submit"
                disabled={
                  !newCategoryName.trim() ||
                  createCategoryMutation.isPending
                }
                style={{
                  fontSize: "0.80rem",
                  fontWeight: 700,
                  height: "40px",
                  borderRadius: "9px",
                  gap: "6px",
                  paddingLeft: "16px",
                  paddingRight: "16px",
                }}
                className="inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) cursor-pointer shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
              >
                {createCategoryMutation.isPending ? (
                  <>
                    <CircleNotch size={14} className="animate-spin" />
                    <span>Adding...</span>
                  </>
                ) : (
                  <>
                    <Plus size={14} weight="bold" />
                    <span>Add</span>
                  </>
                )}
              </button>
            </div>
            {addCategoryError && (
              <p className="m-0 text-[0.78rem] text-[#ff5252] font-medium">
                {addCategoryError}
              </p>
            )}
          </div>
        </form>

        {/* Existing Categories List */}
        <div className="pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-(--text-secondary) text-[0.80rem] font-semibold">
              Existing Categories ({serverCategories.length})
            </span>
            {isLoadingCategories && (
              <CircleNotch
                size={13}
                className="animate-spin text-(--muted)"
              />
            )}
          </div>

          <div className="max-h-[220px] overflow-y-auto flex flex-col gap-1.5 pr-1">
            {serverCategories.length === 0 ? (
              <div className="py-6 text-center text-(--muted) text-[0.82rem] italic">
                No categories found. Add your first category above.
              </div>
            ) : (
              serverCategories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-[8px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] hover:border-[color-mix(in_srgb,var(--text)_16%,transparent)] transition-all duration-150"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Tag
                      size={15}
                      className="text-(--accent) shrink-0"
                      weight="duotone"
                    />
                    <span className="text-(--text) text-[0.86rem] font-medium truncate">
                      {cat.name}
                    </span>
                    <span className="text-(--muted) text-[0.72rem] px-1.5 py-0.5 rounded-[4px] bg-[color-mix(in_srgb,var(--text)_6%,transparent)] shrink-0">
                      {cat.slug}
                    </span>
                  </div>
                  {managesCategories && <button
                    type="button"
                    onClick={() =>
                      setCategoryToDelete({ id: cat.id, name: cat.name })
                    }
                    disabled={deleteCategoryMutation.isPending}
                    title={`Delete category ${cat.name}`}
                    aria-label={`Delete category ${cat.name}`}
                    className="inline-flex w-7 h-7 items-center justify-center rounded-[6px] text-(--muted) hover:text-red-500 hover:bg-red-500/10 border-none bg-transparent cursor-pointer transition-colors duration-150 p-0 shrink-0"
                  >
                    <Trash size={14} />
                  </button>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end pt-4 mt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
          <button
            type="button"
            onClick={handleCloseAddCategoryModal}
            style={{
              fontSize: "0.80rem",
              fontWeight: 700,
              height: "34px",
              borderRadius: "8px",
              paddingLeft: "16px",
              paddingRight: "16px",
            }}
            className="inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--text-secondary) bg-transparent cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-(--text)"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
