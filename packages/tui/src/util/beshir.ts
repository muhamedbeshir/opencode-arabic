import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "path"

// Shared with the `model-review` skill, which reads `~/.config/opencode/beshir.json`.
export type DisabledSkill = { id: string; name: string; path: string }

export function beshirConfigPath(home: string) {
  return path.join(home, ".config", "opencode", "beshir.json")
}

export function beshirSkillsManifestPath(state: string) {
  return path.join(state, "beshir-skills.json")
}

export async function readBeshirConfig(file: string): Promise<Record<string, unknown>> {
  const raw = await readFile(file, "utf8").catch(() => undefined)
  if (!raw) return {}
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {}
  return parsed as Record<string, unknown>
}

export function reviewerModel(config: Record<string, unknown>): string | undefined {
  const value = config.reviewer_model
  return typeof value === "string" && value.trim() ? value : undefined
}

export async function writeBeshirConfig(file: string, patch: Record<string, unknown>) {
  const current = await readBeshirConfig(file)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ ...current, ...patch }, null, 2))
}

// The dialog owns only its own keys, so a write must preserve any other Beshir
// settings already in the file.
export async function writeReviewerModel(file: string, model: string) {
  await writeBeshirConfig(file, { reviewer_model: model })
}

export async function readDisabledSkills(file: string): Promise<DisabledSkill[]> {
  const raw = await readFile(file, "utf8").catch(() => undefined)
  if (!raw) return []
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== "object" || parsed === null) return []
  const disabled = (parsed as { disabled?: unknown }).disabled
  if (!Array.isArray(disabled)) return []
  return disabled.flatMap((item): DisabledSkill[] => {
    if (typeof item !== "object" || item === null) return []
    const record = item as Partial<DisabledSkill>
    if (typeof record.id !== "string" || typeof record.name !== "string" || typeof record.path !== "string") return []
    return [{ id: record.id, name: record.name, path: record.path }]
  })
}

export async function writeDisabledSkills(file: string, entries: DisabledSkill[]) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ disabled: entries }, null, 2))
}
