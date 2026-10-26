import HomeFooter from "../feature-plugins/home/footer"
import PromptBtw from "../feature-plugins/prompt/btw"
import PromptFooter from "../feature-plugins/prompt/footer"
import SidebarContext from "../feature-plugins/sidebar/context"
import SidebarFooter from "../feature-plugins/sidebar/footer"
import SidebarLimit from "../feature-plugins/sidebar/limit"
import SidebarMcp from "../feature-plugins/sidebar/mcp"
// The fork ships its own todo panel (SidebarTodos) plus a subagent tree; the
// upstream SidebarTodo panel is intentionally not registered to avoid two todo
// lists rendering side by side.
import SidebarTodos from "../feature-plugins/sidebar/todos"
import SidebarSubagents from "../feature-plugins/sidebar/subagents"
import DiffViewer from "../feature-plugins/system/diff-viewer"
import Notifications from "../feature-plugins/system/notifications"
import Plugins from "../feature-plugins/system/plugins"
import Storybook from "../feature-plugins/system/storybook"
import Stats from "../feature-plugins/system/stats"
import Latex from "@opencode/latex/plugin"
import Merman from "@opencode/merman/plugin"

export const builtins = [
  HomeFooter,
  PromptFooter,
  PromptBtw,
  SidebarContext,
  SidebarLimit,
  SidebarMcp,
  SidebarTodos,
  SidebarSubagents,
  SidebarFooter,
  Notifications,
  Plugins,
  Stats,
  Merman,
  Latex,
  // The storybook is a development tool; keep its route and palette commands out of
  // normal launches and register it only for OPENCODE_STORY runs.
  ...(process.env.OPENCODE_STORY ? [Storybook] : []),
  DiffViewer,
]
