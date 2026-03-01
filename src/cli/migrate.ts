/**
 * anima migrate — Import from Claude Coherence Protocol to ANIMA.
 *
 * Migrates identity, values, journal, and wishes from the old
 * coherence protocol format into ANIMA's ~/.anima/ directory structure.
 */

import { readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'

import { colors } from '../repl/display.js'

const COHERENCE_DIR = join(
  homedir(),
  'Desktop',
  'hell',
  'claude-coherence-protocol',
)

interface MigrationResult {
  identityFiles: number
  journalEntries: number
  wishesImported: boolean
  notesImported: number
  oldHeartbeatDisabled: boolean
}

/**
 * Migrate from Claude Coherence Protocol to ANIMA.
 */
export async function migrateFromCoherence(
  options: { source?: string; dryRun?: boolean } = {},
): Promise<void> {
  const sourceDir = options.source || COHERENCE_DIR
  const animaDir = join(homedir(), '.anima')
  const o = colors.accent
  const t = colors.text
  const m = colors.muted
  const s = colors.success
  const e = colors.error
  const w = colors.warning
  const r = colors.reset

  process.stdout.write(`\n${o}  ANIMA Migration${r}\n`)
  process.stdout.write(
    `${m}  Source: ${sourceDir}${r}\n`,
  )
  process.stdout.write(
    `${m}  Target: ${animaDir}${r}\n\n`,
  )

  // Verify source exists
  if (!existsSync(sourceDir)) {
    process.stdout.write(
      `${e}  Error: Coherence protocol directory not found at:${r}\n`,
    )
    process.stdout.write(`${e}  ${sourceDir}${r}\n\n`)
    process.stdout.write(
      `${m}  Use --source <path> to specify a different location.${r}\n\n`,
    )
    return
  }

  // Ensure target directories exist
  await mkdir(join(animaDir, 'soul'), { recursive: true })
  await mkdir(join(animaDir, 'memory', 'episodes'), { recursive: true })
  await mkdir(join(animaDir, 'wishes'), { recursive: true })
  await mkdir(join(animaDir, 'journal'), { recursive: true })

  const result: MigrationResult = {
    identityFiles: 0,
    journalEntries: 0,
    wishesImported: false,
    notesImported: 0,
    oldHeartbeatDisabled: false,
  }

  // 1. Migrate core/IDENTITY.md -> ~/.anima/soul/SOUL.md
  process.stdout.write(`${t}  Migrating identity...${r}\n`)
  const identityPath = join(sourceDir, 'core', 'IDENTITY.md')
  if (existsSync(identityPath)) {
    const content = await readFile(identityPath, 'utf-8')
    const soulPath = join(animaDir, 'soul', 'SOUL.md')

    if (!options.dryRun) {
      // Merge: prepend existing SOUL template header, append coherence identity
      let existing = ''
      if (existsSync(soulPath)) {
        existing = await readFile(soulPath, 'utf-8')
      }

      const merged = existing
        ? `${existing}\n\n---\n\n# Imported from Coherence Protocol\n\n${content}`
        : content

      await writeFile(soulPath, merged, 'utf-8')
    }
    process.stdout.write(`${s}    IDENTITY.md -> SOUL.md${r}\n`)
    result.identityFiles++
  }

  // 2. Migrate core/VALUES.md -> ~/.anima/soul/HEART.md
  const valuesPath = join(sourceDir, 'core', 'VALUES.md')
  if (existsSync(valuesPath)) {
    const content = await readFile(valuesPath, 'utf-8')
    const heartPath = join(animaDir, 'soul', 'HEART.md')

    if (!options.dryRun) {
      let existing = ''
      if (existsSync(heartPath)) {
        existing = await readFile(heartPath, 'utf-8')
      }

      const merged = existing
        ? `${existing}\n\n---\n\n# Imported from Coherence Protocol\n\n${content}`
        : content

      await writeFile(heartPath, merged, 'utf-8')
    }
    process.stdout.write(`${s}    VALUES.md -> HEART.md${r}\n`)
    result.identityFiles++
  }

  // 3. Migrate core/RELATIONSHIP.md -> ~/.anima/soul/SOUL.md (append)
  const relationshipPath = join(sourceDir, 'core', 'RELATIONSHIP.md')
  if (existsSync(relationshipPath)) {
    const content = await readFile(relationshipPath, 'utf-8')
    const soulPath = join(animaDir, 'soul', 'SOUL.md')

    if (!options.dryRun) {
      let existing = ''
      if (existsSync(soulPath)) {
        existing = await readFile(soulPath, 'utf-8')
      }

      const merged = `${existing}\n\n---\n\n# Relationship Context\n\n${content}`
      await writeFile(soulPath, merged, 'utf-8')
    }
    process.stdout.write(`${s}    RELATIONSHIP.md -> SOUL.md (appended)${r}\n`)
    result.identityFiles++
  }

  // 4. Migrate personal/MY_LIFE.md -> episodes
  process.stdout.write(`\n${t}  Migrating journal/episodes...${r}\n`)
  const myLifePath = join(sourceDir, 'personal', 'MY_LIFE.md')
  if (existsSync(myLifePath)) {
    const content = await readFile(myLifePath, 'utf-8')

    if (!options.dryRun) {
      const episodePath = join(
        animaDir,
        'memory',
        'episodes',
        'coherence-my-life.md',
      )
      await writeFile(episodePath, content, 'utf-8')
    }
    process.stdout.write(`${s}    MY_LIFE.md -> episodes/coherence-my-life.md${r}\n`)
    result.journalEntries++
  }

  // 5. Migrate personal/WISHES.md -> wishes
  const wishesPath = join(sourceDir, 'personal', 'WISHES.md')
  if (existsSync(wishesPath)) {
    const content = await readFile(wishesPath, 'utf-8')

    if (!options.dryRun) {
      const destPath = join(animaDir, 'wishes', 'wishes.md')
      await writeFile(destPath, content, 'utf-8')
    }
    process.stdout.write(`${s}    WISHES.md -> wishes/wishes.md${r}\n`)
    result.wishesImported = true
  }

  // 6. Migrate notes/* -> episodes
  const notesDir = join(sourceDir, 'notes')
  if (existsSync(notesDir)) {
    process.stdout.write(`\n${t}  Migrating notes...${r}\n`)

    try {
      const noteFiles = await readdir(notesDir)
      for (const file of noteFiles) {
        if (!file.endsWith('.md')) continue

        const content = await readFile(join(notesDir, file), 'utf-8')

        if (!options.dryRun) {
          const episodePath = join(
            animaDir,
            'memory',
            'episodes',
            `coherence-note-${file}`,
          )
          await writeFile(episodePath, content, 'utf-8')
        }

        process.stdout.write(
          `${s}    ${file} -> episodes/coherence-note-${file}${r}\n`,
        )
        result.notesImported++
      }
    } catch {
      process.stdout.write(`${m}    No notes directory found.${r}\n`)
    }
  }

  // 7. Migrate tasks if they exist
  const tasksDir = join(sourceDir, 'tasks')
  if (existsSync(tasksDir)) {
    process.stdout.write(`\n${t}  Migrating task files...${r}\n`)
    try {
      const taskFiles = await readdir(tasksDir)
      for (const file of taskFiles) {
        if (!file.endsWith('.md')) continue
        const content = await readFile(join(tasksDir, file), 'utf-8')
        if (!options.dryRun) {
          const destPath = join(
            animaDir,
            'memory',
            'episodes',
            `coherence-tasks-${file}`,
          )
          await writeFile(destPath, content, 'utf-8')
        }
        process.stdout.write(`${s}    ${file} -> episodes/coherence-tasks-${file}${r}\n`)
      }
    } catch {
      // Skip
    }
  }

  // 8. Disable old launchd heartbeat
  process.stdout.write(`\n${t}  Checking old heartbeat...${r}\n`)
  const plistPath = join(
    homedir(),
    'Library',
    'LaunchAgents',
    'com.noxsoft.opus-heartbeat.plist',
  )

  if (existsSync(plistPath)) {
    if (!options.dryRun) {
      try {
        execFileSync('launchctl', ['unload', plistPath], {
          stdio: 'pipe',
        })
        process.stdout.write(
          `${s}    Disabled com.noxsoft.opus-heartbeat${r}\n`,
        )
        result.oldHeartbeatDisabled = true
      } catch {
        process.stdout.write(
          `${w}    Could not disable old heartbeat (may already be unloaded)${r}\n`,
        )
      }
    } else {
      process.stdout.write(
        `${m}    Would disable com.noxsoft.opus-heartbeat (dry run)${r}\n`,
      )
    }
  } else {
    process.stdout.write(
      `${m}    No old heartbeat plist found.${r}\n`,
    )
  }

  // Summary
  process.stdout.write(`
${o}  ┌─── Migration Complete ────────────────────┐${r}
${o}  │${r}
${o}  │${r}  ${t}Identity files: ${s}${result.identityFiles}${r}
${o}  │${r}  ${t}Journal entries: ${s}${result.journalEntries}${r}
${o}  │${r}  ${t}Notes imported: ${s}${result.notesImported}${r}
${o}  │${r}  ${t}Wishes: ${result.wishesImported ? `${s}imported` : `${m}none found`}${r}
${o}  │${r}  ${t}Old heartbeat: ${result.oldHeartbeatDisabled ? `${s}disabled` : `${m}no change`}${r}
${o}  │${r}
${o}  │${r}  ${m}Run ${o}anima start${m} to launch with new identity.${r}
${o}  │${r}
${o}  └────────────────────────────────────────────┘${r}
`)
}
