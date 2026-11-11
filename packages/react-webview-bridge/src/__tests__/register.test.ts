/**
 * Type-level checks for contract registration (`Register`). `tsc --noEmit` (the package's
 * typecheck) enforces them; the runtime test below only keeps the file in the test run.
 *
 * The file never augments `Register` itself: declaration merging applies to the whole program, so
 * it would change the default contract every other test sees. `ContractOf` is the same lookup
 * `RegisteredContract` does, applied to stand-in registers.
 */
import assert from "node:assert/strict";
import { it } from "node:test";
import type {
  BridgeController,
  BridgeInstance,
  ContractOf,
  RegisteredContract,
} from "../index.ts";

type Equal<A, B> =
  (<V>() => V extends A ? 1 : 2) extends <V>() => V extends B ? 1 : 2
    ? true
    : false;
const expectType = <T extends true>(value: T): T => value;

interface AppContract {
  platform(): Promise<{ name: string }>;
  files: { info(path: string): Promise<number> };
}

// A registered contract becomes the default.
expectType<Equal<ContractOf<{ contract: AppContract }>, AppContract>>(true);
// Nothing registered: the untyped default of before.
expectType<Equal<ContractOf<object>, Record<string, unknown>>>(true);
// This package registers nothing, so its own default is untyped.
expectType<Equal<RegisteredContract, Record<string, unknown>>>(true);
expectType<Equal<BridgeInstance, BridgeInstance<Record<string, unknown>>>>(
  true,
);
// The default flows into the controller's `call`.
declare const controller: BridgeController<
  ContractOf<{ contract: AppContract }>
>;
const typedCall = () => controller.call((bridge) => bridge.files.info("a.txt"));
expectType<Equal<ReturnType<typeof typedCall>, Promise<number>>>(true);
// @ts-expect-error a function the contract does not have
const missingCall = () => controller.call((bridge) => bridge.nope());

it("contract registration is checked by the typecheck", () => {
  assert.equal(typeof typedCall, "function");
  assert.equal(typeof missingCall, "function");
});
