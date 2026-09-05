import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { isMainModule } from "../src/entrypoint.ts";

describe("isMainModule", () => {
  const sampleLinuxUrl =
    "file:///home/debian/project/apps/fleet-manager/src/cli.ts";
  const sampleWindowsUrl =
    "file:///C:/Users/developer/project/apps/fleet-manager/src/cli.ts";

  it("returns false if argv1 is undefined or empty", () => {
    assert.equal(isMainModule(sampleLinuxUrl, undefined), false);
    assert.equal(isMainModule(sampleLinuxUrl, ""), false);
  });

  it("detects exact match for POSIX paths", () => {
    assert.equal(
      isMainModule(
        sampleLinuxUrl,
        "/home/debian/project/apps/fleet-manager/src/cli.ts",
      ),
      true,
    );
  });

  it("detects match for relative paths resolving to the current module", () => {
    const cwd = process.cwd();
    const targetFile = resolve(cwd, "src/entrypoint.ts");
    const targetUrl = pathToFileURL(targetFile).href;
    assert.equal(isMainModule(targetUrl, "src/entrypoint.ts"), true);
    assert.equal(isMainModule(targetUrl, "./src/entrypoint.ts"), true);
  });

  it(
    "detects match for Windows backward slash paths and handles case-insensitivity",
    { skip: process.platform !== "win32" },
    () => {
      assert.equal(
        isMainModule(
          sampleWindowsUrl,
          "C:\\Users\\developer\\project\\apps\\fleet-manager\\src\\cli.ts",
        ),
        true,
      );
      assert.equal(
        isMainModule(
          sampleWindowsUrl,
          "c:\\users\\developer\\project\\apps\\fleet-manager\\src\\cli.ts",
        ),
        true,
      );
    },
  );

  it("returns false for different files", () => {
    assert.equal(
      isMainModule(
        sampleLinuxUrl,
        "/home/debian/project/apps/fleet-manager/src/index.ts",
      ),
      false,
    );
    assert.equal(
      isMainModule(
        sampleLinuxUrl,
        "/home/debian/project/apps/fleet-manager/src/other-cli.ts",
      ),
      false,
    );
  });

  it("does not false-positive on substring prefix without segment boundary", () => {
    assert.equal(isMainModule(sampleLinuxUrl, "manager/src/cli.ts.bak"), false);
    assert.equal(isMainModule(sampleLinuxUrl, "fake-cli.ts"), false);
  });

  it("does not match different files that share the same basename (regression test)", () => {
    const fileA = resolve("/workspace/project/apps/fleet-manager/src/cli.ts");
    const fileB = resolve("/workspace/project/apps/media-worker/src/cli.ts");
    const urlA = pathToFileURL(fileA).href;
    const urlB = pathToFileURL(fileB).href;

    // fileA executed, urlA matches
    assert.equal(isMainModule(urlA, fileA), true);
    // fileA executed, urlB (different file with same basename 'cli.ts') must NOT match
    assert.equal(isMainModule(urlB, fileA), false);
    // fileB executed, urlA must NOT match
    assert.equal(isMainModule(urlA, fileB), false);
  });

  it("works with real current module and process.argv[1]", () => {
    const thisFileUrl = import.meta.url;
    const thisFilePath = resolve(process.argv[1] ?? "");
    const thisFileExpected = pathToFileURL(thisFilePath).href === thisFileUrl;

    assert.equal(isMainModule(thisFileUrl), thisFileExpected);
  });
});
