import { basicsChangeToSend, draftValueAfterReload } from "./basicsDraftChange";

/**
 * The category in a course editor's unsaved basics draft: when a save sends
 * it, and what a reloaded course does to it.
 *
 * Every basics save used to send the draft's category, changed or not. Two
 * things followed. A course whose category had since been deleted could not
 * save anything (the unchanged, deleted id was refused as
 * `INVALID_CATEGORY`). And a draft that showed no category while the stored
 * course had one — the course was given a category elsewhere, and reloaded
 * here while this draft held another unsaved edit — sent `null`, which now
 * removes the stored category. The category is the creator's to change, so
 * it is sent only when they changed it, and an untouched one follows the
 * course when it is reloaded.
 *
 * The rule is `basicsDraftChange`'s; the course's level follows it too.
 */

/**
 * The category part of a basics save: `{ categoryId }` when the draft's
 * category differs from the one last confirmed by the server (an empty draft
 * value removes it), nothing when it is unchanged.
 */
export function categoryChangeToSend(
  draftCategoryId: string,
  confirmedCategoryId: string,
): { categoryId?: string | null } {
  return basicsChangeToSend("categoryId", draftCategoryId, confirmedCategoryId);
}

/**
 * The category an unsaved draft holds after the course was reloaded and the
 * draft kept: the reloaded one when the creator had not changed it (the
 * draft still held what the server last confirmed), their own choice when
 * they had.
 */
export function draftCategoryAfterReload(
  draftCategoryId: string,
  previouslyConfirmedCategoryId: string,
  reloadedCategoryId: string,
): string {
  return draftValueAfterReload(
    draftCategoryId,
    previouslyConfirmedCategoryId,
    reloadedCategoryId,
  );
}
