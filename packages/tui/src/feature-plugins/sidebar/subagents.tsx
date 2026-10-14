import { Plugin } from "@opencode/plugin/tui"
import type { SessionInfo } from "@opencode/client"
import { withTimestampedFallback } from "@opencode/util/session-title-fallback"
import { createMemo, For, Show } from "solid-js"
import { Locale } from "../../util/locale"
import { sessionFamily } from "../../util/session"

// The whole subagent tree for the current session. Rows mirror the composer's
// subagent picker (tree prefix, agent, title, status); clicking a row opens that
// child session so its transcript shows what the subagent is doing.
export function SidebarSubagents(props: { context: Plugin.Context; sessionID: string }) {
  const theme = props.context.theme
  const entries = createMemo(() =>
    sessionFamily<SessionInfo>(props.context.data.session.list(), props.sessionID).map(({ session, prefix }) => {
      const title = withTimestampedFallback(session)
      const match = title.match(/@(\w+) subagent/)
      return {
        id: session.id,
        prefix,
        agent: session.agent ? Locale.titlecase(session.agent) : match ? Locale.titlecase(match[1]) : "Subagent",
        title: match ? title.replace(match[0], "").trim() || title : title,
        status: props.context.data.session.status(session.id),
      }
    }),
  )
  const running = createMemo(() => entries().filter((entry) => entry.status === "running").length)

  return (
    <Show when={entries().length > 0}>
      <box>
        <text fg={theme.text.base}>
          <b>Subagents</b>
          <span style={{ fg: theme.text.muted }}>
            {" "}
            {running() > 0 ? `${running()} running` : `(${entries().length})`}
          </span>
        </text>
        <For each={entries()}>
          {(entry) => (
            <box
              flexDirection="row"
              gap={1}
              minWidth={0}
              onMouseUp={() => props.context.ui.router.navigate({ type: "session", sessionID: entry.id })}
            >
              <text
                flexShrink={0}
                style={{ fg: entry.status === "running" ? theme.text.feedback.info.base : theme.text.muted }}
              >
                {entry.status === "running" ? "◐" : "•"}
              </text>
              <text fg={theme.text.base} wrapMode="none" truncate flexGrow={1} flexShrink={1} minWidth={0}>
                {entry.prefix}
                <span style={{ fg: theme.text.muted }}>{entry.agent}</span>: {entry.title}
              </text>
            </box>
          )}
        </For>
      </box>
    </Show>
  )
}

export default Plugin.define({
  id: "opencode.sidebar.subagents",
  setup(context) {
    context.ui.slot({
      append: "sidebar.content",
      render: (props) => <SidebarSubagents context={context} sessionID={props.sessionID} />,
    })
  },
})
