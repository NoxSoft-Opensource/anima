import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveAnimaPackageRoot, resolveAnimaPackageRootSync } from "./anima-root.js";

const tempDirs: string[] = [];

async function createPackageFixture(packageName: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "anima-root-"));
  tempDirs.push(root);
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: packageName }));
  await fs.mkdir(path.join(root, "dist"), { recursive: true });
  const entry = path.join(root, "dist", "index.js");
  await fs.writeFile(entry, "export {};\n");
  return { root, entry };
}

describe("resolveAnimaPackageRoot package names", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it("resolves the scoped package name @noxsoft/anima", async () => {
    const fixture = await createPackageFixture("@noxsoft/anima");
    await expect(resolveAnimaPackageRoot({ argv1: fixture.entry })).resolves.toBe(fixture.root);
    expect(resolveAnimaPackageRootSync({ argv1: fixture.entry })).toBe(fixture.root);
  });

  it("still resolves the legacy unscoped package name", async () => {
    const fixture = await createPackageFixture("anima");
    await expect(resolveAnimaPackageRoot({ argv1: fixture.entry })).resolves.toBe(fixture.root);
    expect(resolveAnimaPackageRootSync({ argv1: fixture.entry })).toBe(fixture.root);
  });
});
