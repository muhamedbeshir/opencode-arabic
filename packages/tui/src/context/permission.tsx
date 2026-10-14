import { createSignal } from "solid-js"
import { useConfig } from "../config"
import { useArgs } from "./args"
import { createSimpleContext } from "./helper"

export type PermissionMode = "prompt" | "autoaccept"

export const { use: usePermission, provider: PermissionProvider } = createSimpleContext({
  name: "Permission",
  init: () => {
    const args = useArgs()
    const config = useConfig()
    // The configured preference is the baseline; the permission-mode cycle
    // (Shift+Tab) overrides it for this client without rewriting the config.
    const [override, setOverride] = createSignal<PermissionMode | undefined>(undefined)
    const configured = (): PermissionMode => (args.auto ? "autoaccept" : config.data.session.permissions)
    return {
      get mode(): PermissionMode {
        return override() ?? configured()
      },
      set(mode: PermissionMode) {
        setOverride(mode)
      },
    }
  },
})
