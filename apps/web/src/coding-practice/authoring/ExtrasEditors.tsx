import { useState } from "react";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import type { CodingHint, CodingMockRoute } from "@veolms/contracts";
import { CODING_LIMITS } from "@veolms/contracts";
import { Button } from "../../components/Button";
import { ThemedSelect } from "../../ThemedSelect";
import {
  FIELD,
  HAIRLINE,
  IconAction,
  MONO,
  SELECT_TRIGGER,
} from "../shared/ui";

let counter = 0;
const newId = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Hints, shown one by one; each may wait for some failed submits. */
export function HintsEditor({
  hints,
  onChange,
}: {
  hints: CodingHint[];
  onChange: (hints: CodingHint[]) => void;
}) {
  const update = (id: string, patch: Partial<CodingHint>) =>
    onChange(
      hints.map((hint) => (hint.id === id ? { ...hint, ...patch } : hint)),
    );
  return (
    <div className="grid gap-3">
      <p className="text-sm text-(--text-secondary)">
        Learners open hints one at a time. Write them from a nudge to a
        near-answer. Markdown works.
      </p>
      {hints.map((hint, index) => (
        <div
          key={hint.id}
          className={`grid gap-2 rounded-xl border p-3 ${HAIRLINE}`}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-(--text)">
              Hint {index + 1}
            </span>
            <label className="ml-auto flex items-center gap-2 text-xs text-(--text-secondary)">
              Opens after
              <input
                type="number"
                min={0}
                max={50}
                value={hint.unlockAfterFailedSubmits}
                onChange={(event) =>
                  update(hint.id, {
                    unlockAfterFailedSubmits: Math.min(
                      50,
                      Math.max(0, Number(event.target.value) || 0),
                    ),
                  })
                }
                className={`${FIELD} h-8 w-16`}
                aria-label={`Hint ${index + 1}: failed submits before it opens`}
              />
              failed submits
            </label>
            <IconAction
              label={`Remove hint ${index + 1}`}
              onClick={() =>
                onChange(hints.filter((item) => item.id !== hint.id))
              }
            >
              <Trash size={15} aria-hidden="true" />
            </IconAction>
          </div>
          <textarea
            value={hint.body}
            onChange={(event) => update(hint.id, { body: event.target.value })}
            rows={3}
            aria-label={`Hint ${index + 1}`}
            placeholder="Think about what happens when the array is empty."
            className={`${FIELD} py-2`}
          />
        </div>
      ))}
      <Button
        variant="quiet"
        elevation="flat"
        className="justify-self-start"
        disabled={hints.length >= CODING_LIMITS.maxHints}
        onClick={() =>
          onChange([
            ...hints,
            {
              id: newId("h"),
              body: "",
              unlockAfterFailedSubmits: hints.length,
            },
          ])
        }
      >
        <Plus size={16} weight="bold" aria-hidden="true" />
        Add a hint
      </Button>
    </div>
  );
}

const METHODS: CodingMockRoute["method"][] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
];

function BodyField({
  value,
  onChange,
  label,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  label: string;
}) {
  const [text, setText] = useState(() =>
    JSON.stringify(value ?? null, null, 2),
  );
  const [invalid, setInvalid] = useState(false);
  return (
    <textarea
      value={text}
      rows={4}
      spellCheck={false}
      aria-label={label}
      aria-invalid={invalid}
      onChange={(event) => {
        setText(event.target.value);
        try {
          onChange(JSON.parse(event.target.value));
          setInvalid(false);
        } catch {
          setInvalid(true);
        }
      }}
      className={`${FIELD} py-2 ${MONO} sm:text-[0.8125rem]! ${invalid ? "border-rose-500!" : ""}`}
    />
  );
}

/**
 * Routes the sandbox's fetch() answers. The sandbox has no network, so an
 * exercise that teaches fetch() lists what its API returns here.
 */
export function MocksEditor({
  mocks,
  onChange,
}: {
  mocks: CodingMockRoute[];
  onChange: (mocks: CodingMockRoute[]) => void;
}) {
  const update = (index: number, patch: Partial<CodingMockRoute>) =>
    onChange(
      mocks.map((mock, at) => (at === index ? { ...mock, ...patch } : mock)),
    );
  return (
    <div className="grid gap-3">
      <p className="text-sm text-(--text-secondary)">
        Code in this exercise has no internet. List the requests it may make and
        what they answer; anything else fails with a clear message.
      </p>
      {mocks.map((mock, index) => (
        <div
          key={index}
          className={`grid gap-2 rounded-xl border p-3 ${HAIRLINE}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-28">
              <ThemedSelect<CodingMockRoute["method"]>
                triggerClassName={SELECT_TRIGGER}
                value={mock.method}
                onValueChange={(method) => update(index, { method })}
                options={METHODS.map(
                  (method) =>
                    [method, method] as [CodingMockRoute["method"], string],
                )}
                ariaLabel={`Route ${index + 1} method`}
              />
            </div>
            <input
              value={mock.path}
              onChange={(event) => update(index, { path: event.target.value })}
              placeholder="/api/users"
              aria-label={`Route ${index + 1} path`}
              className={`${FIELD} h-10 min-w-40 flex-1 font-mono!`}
            />
            <label className="flex items-center gap-1.5 text-xs text-(--text-secondary)">
              Status
              <input
                type="number"
                min={100}
                max={599}
                value={mock.status}
                onChange={(event) =>
                  update(index, { status: Number(event.target.value) || 200 })
                }
                className={`${FIELD} h-10 w-20`}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-(--text-secondary)">
              Delay ms
              <input
                type="number"
                min={0}
                max={5000}
                value={mock.delayMs}
                onChange={(event) =>
                  update(index, {
                    delayMs: Math.min(
                      5000,
                      Math.max(0, Number(event.target.value) || 0),
                    ),
                  })
                }
                className={`${FIELD} h-10 w-20`}
              />
            </label>
            <IconAction
              label={`Remove route ${index + 1}`}
              onClick={() => onChange(mocks.filter((_, at) => at !== index))}
            >
              <Trash size={15} aria-hidden="true" />
            </IconAction>
          </div>
          <BodyField
            value={mock.body}
            label={`Route ${index + 1} response body (JSON)`}
            onChange={(body) => update(index, { body })}
          />
        </div>
      ))}
      <Button
        variant="quiet"
        elevation="flat"
        className="justify-self-start"
        disabled={mocks.length >= CODING_LIMITS.maxMocks}
        onClick={() =>
          onChange([
            ...mocks,
            {
              method: "GET",
              path: "/api/items",
              status: 200,
              body: [],
              delayMs: 300,
            },
          ])
        }
      >
        <Plus size={16} weight="bold" aria-hidden="true" />
        Add a route
      </Button>
    </div>
  );
}
