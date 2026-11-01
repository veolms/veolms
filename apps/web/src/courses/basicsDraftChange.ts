/**
 * A value in a course editor's unsaved basics draft that a save must not
 * send unless the creator changed it (the category, the level): when a save
 * sends it, and what a reloaded course does to it.
 *
 * Every basics save used to send the draft's value, changed or not, with an
 * empty one sent as `null`. That is harmless only while the server ignores
 * `null`. Once `null` removes the stored value, a draft that shows none
 * while the stored course has one (the course was changed elsewhere, and
 * reloaded here while this draft held another unsaved edit) would remove it
 * on the next save of anything. So the value is sent only when it differs
 * from what the server last confirmed, and an untouched one follows the
 * course when it is reloaded.
 */

/**
 * The part of a basics save for one such field: `{ [field]: value }` when
 * the draft differs from the value last confirmed by the server (an empty
 * draft value is sent as `null`, which removes it), nothing when it is
 * unchanged.
 */
export function basicsChangeToSend<Field extends string, Value extends string>(
  field: Field,
  /** The draft's value; `""` when the draft holds none. */
  draftValue: Value,
  /** The value the server last confirmed; `""` when the course has none. */
  confirmedValue: Value,
): Partial<Record<Field, Exclude<Value, ""> | null>> {
  if (draftValue === confirmedValue) return {};
  return { [field]: draftValue || null } as Partial<
    Record<Field, Exclude<Value, ""> | null>
  >;
}

/**
 * The value an unsaved draft holds after the course was reloaded and the
 * draft kept: the reloaded one when the creator had not changed it (the
 * draft still held what the server last confirmed), their own choice when
 * they had.
 */
export function draftValueAfterReload<Value extends string>(
  draftValue: Value,
  previouslyConfirmedValue: Value,
  reloadedValue: Value,
): Value {
  return draftValue === previouslyConfirmedValue ? reloadedValue : draftValue;
}
