import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  beshirConfigPath,
  beshirSkillsManifestPath,
  readBeshirConfig,
  readDisabledSkills,
  reviewerModel,
  writeDisabledSkills,
  writeReviewerModel,
} from "../../src/util/beshir"

function tempDir() {
  return mkdtemp(path.join(tmpdir(), "beshir-"))
}

describe("beshir paths", () => {
  test("config path is <home>/.config/opencode/beshir.json", () => {
    expect(beshirConfigPath("/home/me")).toBe(path.join("/home/me", ".config", "opencode", "beshir.json"))
  })

  test("skills manifest lives in the state directory", () => {
    expect(beshirSkillsManifestPath("/state")).toBe(path.join("/state", "beshir-skills.json"))
  })
})

describe("reviewer model config", () => {
  test("a missing file reads as empty", async () => {
    const dir = await tempDir()
    try {
      expect(await readBeshirConfig(path.join(dir, "beshir.json"))).toEqual({})
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("writing then reading round-trips the model", async () => {
    const dir = await tempDir()
    try {
      const file = path.join(dir, "nested", "beshir.json")
      await writeReviewerModel(file, "opencode-go/deepseek-v4.1-flash")
      expect(await readBeshirConfig(file)).toEqual({ reviewer_model: "opencode-go/deepseek-v4.1-flash" })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("writing preserves unrelated keys and replaces the model", async () => {
    const dir = await tempDir()
    try {
      const file = path.join(dir, "beshir.json")
      await writeFile(file, JSON.stringify({ reviewer_model: "a/b", keep: true }))
      await writeReviewerModel(file, "c/d")
      expect(await readBeshirConfig(file)).toEqual({ reviewer_model: "c/d", keep: true })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("a non-string reviewer_model is ignored", async () => {
    const dir = await tempDir()
    try {
      const file = path.join(dir, "beshir.json")
      await writeFile(file, JSON.stringify({ reviewer_model: 123 }))
      expect(reviewerModel(await readBeshirConfig(file))).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("disabled skills manifest", () => {
  test("round-trips entries and drops malformed ones", async () => {
    const dir = await tempDir()
    try {
      const file = path.join(dir, "beshir-skills.json")
      await writeDisabledSkills(file, [{ id: "foo", name: "Foo", path: "/skills/foo/SKILL.md" }])
      expect(await readDisabledSkills(file)).toEqual([{ id: "foo", name: "Foo", path: "/skills/foo/SKILL.md" }])

      await writeFile(file, JSON.stringify({ disabled: [{ id: "ok", name: "Ok", path: "/p" }, { id: 1 }, "nope"] }))
      expect(await readDisabledSkills(file)).toEqual([{ id: "ok", name: "Ok", path: "/p" }])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
