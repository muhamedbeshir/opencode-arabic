import { describe, expect, test } from "bun:test"
import { TodoWriteTool } from "@opencode/core/tool/plugin/todowrite"

describe("TodoWriteTool", () => {
  test("summarizes counts and marks each status", () => {
    const text = TodoWriteTool.toModelContent([
      { content: "write code", status: "completed" },
      { content: "add tests", status: "in_progress" },
      { content: "review", status: "pending" },
    ])
    expect(text).toContain("1 completed, 1 in progress, 1 pending")
    expect(text).toContain("[x] write code")
    expect(text).toContain("[>] add tests")
    expect(text).toContain("[ ] review")
  })

  test("reports an empty list", () => {
    expect(TodoWriteTool.toModelContent([])).toBe("The todo list is now empty.")
  })
})
