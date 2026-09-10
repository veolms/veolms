import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ask,
  askChoice,
  banner,
  bold,
  cyan,
  dim,
  execCommand,
  green,
  info,
  isNonInteractive,
  isReadlineInterface,
  ok,
  red,
  step,
  warn,
  yellow,
} from "../src/terminal.ts";

describe("Terminal & Readline Helpers", () => {
  it("formats ANSI escape strings correctly", () => {
    assert.equal(bold("hello"), "\x1b[1mhello\x1b[0m");
    assert.equal(dim("hello"), "\x1b[2mhello\x1b[0m");
    assert.equal(red("hello"), "\x1b[31mhello\x1b[0m");
    assert.equal(green("hello"), "\x1b[32mhello\x1b[0m");
    assert.equal(yellow("hello"), "\x1b[33mhello\x1b[0m");
    assert.equal(cyan("hello"), "\x1b[36mhello\x1b[0m");
  });

  it("identifies valid and invalid readline interfaces", () => {
    assert.equal(isReadlineInterface(null), false);
    assert.equal(isReadlineInterface(undefined), false);
    assert.equal(isReadlineInterface("not-an-object"), false);
    assert.equal(isReadlineInterface({}), false);
    assert.equal(isReadlineInterface({ question: "not-a-function" }), false);
    assert.equal(isReadlineInterface({ question: () => {} }), true);
  });

  it("checks non-interactive flags and options accurately", () => {
    assert.equal(isNonInteractive({ nonInteractive: true }), true);
    assert.equal(isNonInteractive({ interactive: false }), true);
    assert.equal(isNonInteractive({ interactive: true }), false);
  });

  it("ask: returns default value in non-interactive mode or without rl", async () => {
    const res1 = await ask(undefined, "Enter URL", "https://default.com");
    assert.equal(res1, "https://default.com");

    const mockRl = {
      question: async () => "from-mock",
    } as any;

    const res2 = await ask(mockRl, "Enter URL", "https://default.com", true);
    assert.equal(res2, "https://default.com");
  });

  it("ask: prompts rl and strips Windows CRLF line endings", async () => {
    const mockRl = {
      question: async () => "windows-input\r\n",
    } as any;

    const res = await ask(mockRl, "Enter value", "fallback", false);
    assert.equal(res, "windows-input");
  });

  it("ask: returns default value when empty string entered with CRLF", async () => {
    const mockRl = {
      question: async () => "\r\n",
    } as any;

    const res = await ask(mockRl, "Enter value", "fallback", false);
    assert.equal(res, "fallback");
  });

  it("askChoice: selects default in non-interactive mode or without rl", async () => {
    const choices = [
      { label: "Option A", value: "a" as const },
      { label: "Option B", value: "b" as const },
    ];

    const res1 = await askChoice(undefined, "Pick option", choices, 1);
    assert.equal(res1, "b");

    const mockRl = {
      question: async () => "1",
    } as any;

    const res2 = await askChoice(mockRl, "Pick option", choices, 0, true);
    assert.equal(res2, "a");
  });

  it("askChoice: parses user selection and handles Windows CRLF", async () => {
    const choices = [
      { label: "Option A", value: "a" as const },
      { label: "Option B", value: "b" as const },
    ];

    const mockRl = {
      question: async () => "2\r\n",
    } as any;

    const res = await askChoice(mockRl, "Pick option", choices, 0, false);
    assert.equal(res, "b");
  });

  it("askChoice: falls back to default choice when invalid selection provided", async () => {
    const choices = [
      { label: "Option A", value: "a" as const },
      { label: "Option B", value: "b" as const },
    ];

    const mockRl = {
      question: async () => "99\r\n",
    } as any;

    const res = await askChoice(mockRl, "Pick option", choices, 0, false);
    assert.equal(res, "a");
  });
});

it("executes safe commands with execCommand", () => {
  const nodeVer = execCommand("node -v");
  assert.ok(nodeVer !== null && nodeVer.startsWith("v"));

  const invalid = execCommand("non-existent-binary-12345");
  assert.equal(invalid, null);
});
