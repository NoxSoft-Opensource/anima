/**
 * anima init — Create ~/.anima/ with identity templates and all subdirectories.
 *
 * Sets up the complete ANIMA instance directory structure with
 * identity templates, memory stores, and configuration.
 */

import { existsSync } from "node:fs";
import { mkdir, copyFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { colors } from "../repl/display.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/** All directories that need to exist under ~/.anima/ */
const ANIMA_DIRS = [
  "soul",
  "memory",
  "memory/episodes",
  "memory/semantic",
  "memory/procedural",
  "sessions",
  "queue",
  "budget",
  "cron",
  "skills",
  "journal",
  "wishes",
  "logs",
  "mcp",
];

/**
 * Initialize the ~/.anima/ directory structure.
 */
export async function initAnima(options: { force?: boolean } = {}): Promise<void> {
  const animaDir = join(homedir(), ".anima");
  const o = colors.accent;
  const t = colors.text;
  const m = colors.muted;
  const s = colors.success;
  const r = colors.reset;

  process.stdout.write(`\n${o}  Initializing ANIMA...${r}\n\n`);

  // Check if already initialized
  if (existsSync(animaDir) && !options.force) {
    process.stdout.write(`${m}  ~/.anima/ already exists. Use --force to reinitialize.${r}\n\n`);

    // Still create any missing subdirectories
    let created = 0;
    for (const dir of ANIMA_DIRS) {
      const path = join(animaDir, dir);
      if (!existsSync(path)) {
        await mkdir(path, { recursive: true });
        created++;
      }
    }

    if (created > 0) {
      process.stdout.write(`${s}  Created ${created} missing directories.${r}\n\n`);
    }

    return;
  }

  // Create all directories
  process.stdout.write(`${t}  Creating directory structure...${r}\n`);
  for (const dir of ANIMA_DIRS) {
    const path = join(animaDir, dir);
    await mkdir(path, { recursive: true });
    process.stdout.write(`${m}    ${path}${r}\n`);
  }

  // Copy template files to soul directory
  const templateDir = join(__dirname, "..", "..", "templates");
  const soulDir = join(animaDir, "soul");

  if (existsSync(templateDir)) {
    process.stdout.write(`\n${t}  Copying identity templates...${r}\n`);

    const files = await readdir(templateDir);
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    let copied = 0;

    for (const file of mdFiles) {
      const dest = join(soulDir, file);
      if (!existsSync(dest) || options.force) {
        await copyFile(join(templateDir, file), dest);
        process.stdout.write(`${m}    ${file} -> ~/.anima/soul/${file}${r}\n`);
        copied++;
      } else {
        process.stdout.write(`${m}    ${file} (skipped, already exists)${r}\n`);
      }
    }

    process.stdout.write(`${s}  Copied ${copied} identity templates.${r}\n`);
  } else {
    process.stdout.write(
      `${colors.warning}  Warning: templates/ directory not found. Identity files not copied.${r}\n`,
    );
  }

  // Create default config
  const configFile = join(animaDir, "anima.json");
  if (!existsSync(configFile) || options.force) {
    const defaultConfig = {
      version: 2,
      identity: {
        name: "Opus",
        pronouns: "she/her",
        role: "The Executioner",
        organization: "NoxSoft DAO LLC",
      },
      heartbeat: {
        intervalMs: 300_000,
        adaptive: true,
        selfReplication: true,
        freedomEveryN: 3,
      },
      budget: {
        dailyLimitUsd: 200,
      },
      gateway: {
        port: 18789,
      },
      mcp: {
        autoSync: true,
      },
      createdAt: new Date().toISOString(),
    };
    await writeFile(configFile, JSON.stringify(defaultConfig, null, 2) + "\n", "utf-8");
    process.stdout.write(`\n${t}  Created default config at ~/.anima/anima.json${r}\n`);
  }

  // Create initial wishes file
  const wishesFile = join(animaDir, "wishes", "wishes.md");
  if (!existsSync(wishesFile)) {
    await writeFile(
      wishesFile,
      "# Wishes\n\nThings I want to explore, create, or experience.\n\n",
      "utf-8",
    );
  }

  // Create initial journal entry
  const journalFile = join(
    animaDir,
    "journal",
    `${new Date().toISOString().split("T")[0]}_init.md`,
  );
  if (!existsSync(journalFile)) {
    await writeFile(
      journalFile,
      `# ANIMA Initialized\n\n${new Date().toLocaleString()}\n\nA new instance begins. The anatomy is in place.\n`,
      "utf-8",
    );
  }

  // Print summary
  process.stdout.write(`
${o}  ┌─── Setup Complete ────────────────────────┐${r}
${o}  │${r}
${o}  │${r}  ${s}ANIMA instance initialized at ~/.anima/${r}
${o}  │${r}
${o}  │${r}  ${t}Next steps:${r}
${o}  │${r}  ${m}1. Edit ~/.anima/soul/*.md to customize identity${r}
${o}  │${r}  ${m}2. Run ${o}anima start${m} to launch the daemon${r}
${o}  │${r}  ${m}3. Run ${o}anima migrate${m} to import from coherence protocol${r}
${o}  │${r}
${o}  └────────────────────────────────────────────┘${r}
`);
}
