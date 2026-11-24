import { useState } from "react";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import type { CodingTestCase } from "@veolms/contracts";
import { CODING_LIMITS } from "@veolms/contracts";
import { Button } from "../../components/Button";
import { Checkbox } from "../../components/Checkbox";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import { ThemedSelect } from "../../ThemedSelect";
import {
  FIELD,
  HAIRLINE,
  IconAction,
  MONO,
  SELECT_TRIGGER,
} from "../shared/ui";

function toJson(value: unknown) {
  try {
    return JSON.stringify(value === undefined ? null : value);
  } catch {
    return "null";
  }
}

/** A JSON cell: kept as typed while it does not parse, saved once it does. */
function JsonCell({
  value,
  onChange,
  label,
  wrapArray,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  label: string;
  /** Arguments are a list; the brackets are implied. */
  wrapArray?: boolean;
}) {
  const shown = wrapArray ? toJson(value).slice(1, -1) : toJson(value);
  const [text, setText] = useState(shown);
  const [invalid, setInvalid] = useState(false);
  return (
    <textarea
      aria-label={label}
      aria-invalid={invalid}
      value={text}
      rows={1}
      spellCheck={false}
      onChange={(event) => {
        setText(event.target.value);
        try {
          const parsed = JSON.parse(
            wrapArray ? `[${event.target.value}]` : event.target.value,
          );
          setInvalid(false);
          onChange(parsed);
        } catch {
          setInvalid(true);
        }
      }}
      className={`${FIELD} min-h-9 resize-y py-1.5 ${MONO} sm:text-[0.8125rem]! ${invalid ? "border-rose-500!" : ""}`}
    />
  );
}

let nextId = 0;
const newId = () => `t${Date.now().toString(36)}${(nextId++).toString(36)}`;

/**
 * The tests of a JavaScript function exercise: a call and its expected
 * value per row.
 */
export function CasesTable({
  cases,
  functionName,
  onChange,
}: {
  cases: CodingTestCase[];
  functionName: string;
  onChange: (cases: CodingTestCase[]) => void;
}) {
  const update = (id: string, patch: Partial<CodingTestCase>) =>
    onChange(
      cases.map((test) => (test.id === id ? { ...test, ...patch } : test)),
    );
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-(--text-secondary)">
          Each row calls{" "}
          <code className={`${MONO} text-(--text)`}>
            {functionName || "yourFunction"}(…)
          </code>{" "}
          with the arguments, as JSON separated by commas. Optional: with no
          rows, learners just run their code and mark it done.
        </p>
      </div>
      <ol className={`grid gap-2`}>
        {cases.map((test, index) => (
          <li
            key={test.id}
            className={`grid gap-2 rounded-xl border p-3 ${HAIRLINE}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-(--muted)">
                {index + 1}
              </span>
              <input
                aria-label={`Test ${index + 1} name`}
                value={test.name}
                onChange={(event) =>
                  update(test.id, { name: event.target.value })
                }
                placeholder="What it checks"
                className={`${FIELD} h-9 min-w-40 flex-1`}
              />
              <Checkbox
                checked={test.hidden}
                onCheckedChange={(hidden) => update(test.id, { hidden })}
                label="Hidden"
              />
              <IconAction
                label={`Remove test ${index + 1}`}
                onClick={() =>
                  onChange(cases.filter((item) => item.id !== test.id))
                }
              >
                <Trash size={15} aria-hidden="true" />
              </IconAction>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_auto]">
              <label className="grid gap-1 text-xs font-semibold text-(--text-secondary)">
                Arguments
                <JsonCell
                  value={test.args}
                  wrapArray
                  label={`Test ${index + 1} arguments`}
                  onChange={(args) =>
                    update(test.id, {
                      args: Array.isArray(args) ? args : [args],
                    })
                  }
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-(--text-secondary)">
                Expected
                <JsonCell
                  key={toJson(test.expected)}
                  value={test.expected}
                  label={`Test ${index + 1} expected value`}
                  onChange={(expected) => update(test.id, { expected })}
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-(--text-secondary)">
                Compare
                <ThemedSelect<"deepEqual" | "approx">
                  triggerClassName={SELECT_TRIGGER}
                  value={test.compare}
                  onValueChange={(compare) => update(test.id, { compare })}
                  options={[
                    ["deepEqual", "Exactly"],
                    ["approx", "Number ±0.000001"],
                  ]}
                  ariaLabel={`Test ${index + 1} comparison`}
                />
              </label>
            </div>
          </li>
        ))}
      </ol>
      <Button
        variant="quiet"
        elevation="flat"
        className="justify-self-start"
        disabled={cases.length >= CODING_LIMITS.maxTests}
        onClick={() =>
          onChange([
            ...cases,
            {
              id: newId(),
              name: `Test ${cases.length + 1}`,
              args: [],
              expected: null,
              compare: "deepEqual",
              hidden: false,
            },
          ])
        }
      >
        <Plus size={16} weight="bold" aria-hidden="true" />
        Add a test
      </Button>
    </div>
  );
}
