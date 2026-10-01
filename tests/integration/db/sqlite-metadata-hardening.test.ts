import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const driver of ["bun", "node"] as const) {
  test(
    `metadata hardening and immediate post-exit cleanup under ${driver} SQLite`,
    () => {
      const fixtureDirectory = mkdtempSync(join(tmpdir(), `libredb-sqlite-metadata-${driver}-`));
      const databasePath = join(fixtureDirectory, "fixture.db");
      try {
        let harnessPath = join(import.meta.dir, "sqlite-metadata-hardening-harness.ts");
        if (driver === "node") {
          const bundle = join(fixtureDirectory, "sqlite-metadata-hardening-harness.mjs");
          const build = spawnSync(
            process.execPath,
            ["build", harnessPath, "--target=node", "--format=esm", "--external", "bun:sqlite", "--outfile", bundle],
            { timeout: 30_000 },
          );
          if (build.status !== 0) throw new Error(`Fixture bundle failed: ${build.error ?? build.stderr.toString()}`);
          harnessPath = bundle;
        }
        const run = spawnSync(driver === "bun" ? process.execPath : "node", [harnessPath, databasePath], {
          env: { ...process.env, LIBREDB_SQLITE_DRIVER: driver },
          timeout: driver === "node" ? 30_000 : 5_000,
        });
        if (run.status !== 0) throw new Error(`${driver} fixture failed: ${run.error ?? run.stderr.toString()}`);
        expect(run.signal).toBeNull();
        // Signal 0 checks existence only; it never terminates the child or masks a timeout.
        let childExitError: unknown;
        try {
          process.kill(run.pid, 0);
        } catch (error) {
          childExitError = error;
        }
        expect(childExitError).toMatchObject({ code: "ESRCH" });
        expect(JSON.parse(run.stdout.toString())).toEqual({
          version: expect.any(String),
          tables: 9,
          indexes: 9,
          schemaTables: 11,
        });
        expect(existsSync(databasePath)).toBe(true);
      } finally {
        // spawnSync has waited for child exit; do not mask Windows locks with force or retries.
        if (existsSync(databasePath)) unlinkSync(databasePath);
        expect(existsSync(databasePath)).toBe(false);
        rmSync(fixtureDirectory, { recursive: true, maxRetries: 0 });
        expect(existsSync(fixtureDirectory)).toBe(false);
      }
    },
    driver === "node" ? 60_000 : 5_000,
  );
}
