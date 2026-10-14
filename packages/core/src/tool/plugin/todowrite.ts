export * as TodoWriteTool from "./todowrite.js"

import type { Context } from "@opencode/plugin/effect/plugin"
import { Effect, Schema } from "effect"

export const name = "todowrite"

export const description = `Use this tool to create and update a structured task list for the current session so the user can see your plan and progress.

Use it when:
- A task needs 3 or more distinct steps
- The user gives you several things to do at once, or a list of tasks
- The user explicitly asks for a todo list or plan
- You are about to start work that benefits from visible ordering

Do not use it for a single, straightforward task or for purely conversational requests.

Rules:
- Send the complete list every time; it replaces the previous list.
- Exactly one task may be "in_progress" at a time.
- Mark a task "in_progress" before you start it and "completed" as soon as it is done.
- Keep task text short and in the user's language.`

export const Todo = Schema.Struct({
  content: Schema.String.annotate({ description: "Short description of the task" }),
  status: Schema.Literals(["pending", "in_progress", "completed"]).annotate({
    description: "pending = not started, in_progress = being worked on now, completed = finished",
  }),
})
export type Todo = typeof Todo.Type

export const Input = Schema.Struct({
  todos: Schema.Array(Todo).annotate({ description: "The complete, updated todo list" }),
})
export type Input = typeof Input.Type

export const Output = Schema.Struct({ todos: Schema.Array(Todo) })
export type Output = typeof Output.Type

const STATUS_MARKER: Record<Todo["status"], string> = {
  completed: "[x]",
  in_progress: "[>]",
  pending: "[ ]",
}

export const toModelContent = (todos: ReadonlyArray<Todo>) => {
  if (todos.length === 0) return "The todo list is now empty."
  const lines = todos.map((todo) => `${STATUS_MARKER[todo.status]} ${todo.content}`)
  const counts = {
    completed: todos.filter((todo) => todo.status === "completed").length,
    in_progress: todos.filter((todo) => todo.status === "in_progress").length,
    pending: todos.filter((todo) => todo.status === "pending").length,
  }
  return [
    `Todo list updated: ${counts.completed} completed, ${counts.in_progress} in progress, ${counts.pending} pending.`,
    "",
    ...lines,
  ].join("\n")
}

export const Plugin = {
  id: "opencode.tool.todowrite",
  effect: Effect.fn("TodoWriteTool.Plugin")(function* (ctx: Context) {
    yield* ctx.tool
      .transform((editor) =>
        editor.add({
          name,
          options: { codemode: false },
          description,
          input: Input,
          output: Output,
          execute: (input) =>
            Effect.succeed({
              output: { todos: input.todos },
              content: toModelContent(input.todos),
              metadata: { todos: input.todos },
            }),
        }),
      )
      .pipe(Effect.orDie)
  }),
}
