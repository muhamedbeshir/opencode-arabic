import { TextAttributes } from "@opentui/core"
import { Plugin } from "@opencode/plugin/tui"
import { createMemo, For, Show } from "solid-js"

type TodoEntry = { content: string; status: "pending" | "in_progress" | "completed" }

// The checklist the session's latest `todowrite` call wrote. Mirrors the
// transcript renderer: read the running tool part, newest message first.
export function SidebarTodos(props: { context: Plugin.Context; sessionID: string }) {
  const theme = props.context.theme
  const entries = createMemo(() => {
    const messages = props.context.data.session.message.list(props.sessionID) ?? []
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      if (!message || message.type !== "assistant") continue
      for (let j = message.content.length - 1; j >= 0; j--) {
        const part = message.content[j]
        if (!part || part.type !== "tool" || part.name !== "todowrite") continue
        const todos = todoEntries(part.state.input)
        if (todos.length > 0) return todos
      }
    }
    return []
  })
  const completed = createMemo(() => entries().filter((entry) => entry.status === "completed").length)
  const marker = (status: TodoEntry["status"]) =>
    status === "completed" ? "✔" : status === "in_progress" ? "◐" : "☐"
  const markerColor = (status: TodoEntry["status"]) =>
    status === "completed"
      ? theme.text.feedback.success.base
      : status === "in_progress"
        ? theme.text.feedback.info.base
        : theme.text.muted

  return (
    <Show when={entries().length > 0}>
      <box>
        <text fg={theme.text.base}>
          <b>Todos</b>
          <span style={{ fg: theme.text.muted }}>
            {" "}
            ({completed()}/{entries().length})
          </span>
        </text>
        <For each={entries().slice(0, 8)}>
          {(entry) => (
            <box flexDirection="row" gap={1} minWidth={0}>
              <text flexShrink={0} style={{ fg: markerColor(entry.status) }}>
                {marker(entry.status)}
              </text>
              <text
                flexGrow={1}
                flexShrink={1}
                minWidth={0}
                wrapMode="word"
                fg={entry.status === "pending" ? theme.text.muted : theme.text.base}
                attributes={entry.status === "completed" ? TextAttributes.STRIKETHROUGH : undefined}
              >
                {entry.content}
              </text>
            </box>
          )}
        </For>
        <Show when={entries().length > 8}>
          <text fg={theme.text.muted}>+{entries().length - 8} more</text>
        </Show>
      </box>
    </Show>
  )
}

function todoEntries(value: unknown): TodoEntry[] {
  if (typeof value !== "object" || value === null) return []
  const todos = (value as { todos?: unknown }).todos
  if (!Array.isArray(todos)) return []
  return todos.flatMap((item): TodoEntry[] => {
    if (typeof item !== "object" || item === null) return []
    const record = item as { content?: unknown; status?: unknown }
    if (typeof record.content !== "string") return []
    if (record.status === "completed") return [{ content: record.content, status: "completed" }]
    if (record.status === "in_progress") return [{ content: record.content, status: "in_progress" }]
    return [{ content: record.content, status: "pending" }]
  })
}

export default Plugin.define({
  id: "opencode.sidebar.todos",
  setup(context) {
    context.ui.slot({
      append: "sidebar.content",
      render: (props) => <SidebarTodos context={context} sessionID={props.sessionID} />,
    })
  },
})
