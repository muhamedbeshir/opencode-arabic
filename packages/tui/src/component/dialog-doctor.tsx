import { TextAttributes } from "@opentui/core"
import { createMemo, For } from "solid-js"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useData } from "../context/data"
import { useClient } from "../context/client"
import { useLocation } from "../context/location"
import { describeOS, describeTerminal } from "../util/system"
import { useTuiApp } from "../context/runtime"

type Check = { status: "ok" | "warn" | "fail"; label: string; value: string }

export function DialogDoctor() {
  const theme = useTheme().surface("dialog")
  const dialog = useDialog()
  const data = useData()
  const client = useClient()
  const location = useLocation()
  const app = useTuiApp()

  dialog.setSize("large")

  const checks = createMemo<Check[]>(() => {
    const ref = location.ref
    const providers = data.location.provider.list(ref) ?? []
    const models = data.location.model.list(ref) ?? []
    const agents = (data.location.agent.list(ref) ?? []).filter((agent) => agent.mode !== "subagent")
    const mcp = data.location.mcp.server.list() ?? []
    const connection = client.connection.status()
    const failed = mcp.filter((server) => server.status.status === "failed")
    const needsAuth = mcp.filter((server) => server.status.status === "needs_auth")

    const mcpStatus: Check =
      failed.length > 0
        ? { status: "fail", label: "MCP", value: `${failed.length} failed: ${failed.map((server) => server.name).join(", ")}` }
        : needsAuth.length > 0
          ? {
              status: "warn",
              label: "MCP",
              value: `${needsAuth.length} need authentication: ${needsAuth.map((server) => server.name).join(", ")}`,
            }
          : mcp.length > 0
            ? { status: "ok", label: "MCP", value: `${mcp.length} connected` }
            : { status: "ok", label: "MCP", value: "none configured" }

    return [
      { status: "ok", label: "Version", value: `${app.version} (${app.channel})` },
      {
        status: connection === "connected" ? "ok" : "fail",
        label: "Connection",
        value: connection === "connected" ? "connected" : connection,
      },
      {
        status: providers.length > 0 ? "ok" : "fail",
        label: "Providers",
        value: providers.length > 0 ? `${providers.length} available` : "none — check authentication",
      },
      {
        status: models.length > 0 ? "ok" : "warn",
        label: "Models",
        value: `${models.length} available`,
      },
      {
        status: agents.length > 0 ? "ok" : "warn",
        label: "Agents",
        value: `${agents.length} available`,
      },
      mcpStatus,
      { status: "ok", label: "Directory", value: location.current?.directory ?? location.ref?.directory ?? "unknown" },
      { status: "ok", label: "OS", value: describeOS() },
      { status: "ok", label: "Terminal", value: describeTerminal() },
    ]
  })

  const glyph = (status: Check["status"]) => (status === "ok" ? "✔" : status === "warn" ? "▲" : "✖")
  const color = (status: Check["status"]) =>
    status === "ok"
      ? theme.text.feedback.success.base
      : status === "warn"
        ? theme.text.feedback.warning.base
        : theme.text.feedback.error.base

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text.base} attributes={TextAttributes.BOLD}>
          Doctor
        </text>
        <text fg={theme.text.muted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <box flexDirection="column">
        <For each={checks()}>
          {(check) => (
            <box flexDirection="row" gap={1}>
              <text flexShrink={0} style={{ fg: color(check.status) }}>
                {glyph(check.status)}
              </text>
              <text flexShrink={0} fg={theme.text.muted}>
                {check.label.padEnd(11)}
              </text>
              <text fg={theme.text.base} wrapMode="word">
                {check.value}
              </text>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}
