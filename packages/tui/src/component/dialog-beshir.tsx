import { createMemo, createSignal, onMount } from "solid-js"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "path"
import { useData } from "../context/data"
import { useLocation } from "../context/location"
import { useTuiPaths } from "../context/runtime"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { errorMessage } from "../util/error"

// A skill is "disabled" by renaming its markdown file to "<file>.disabled",
// which removes it from the skill scan (`{*.md,**/SKILL.md}`). The disabled set is
// remembered so the toggle list can show and re-enable them.
type DisabledEntry = { id: string; name: string; path: string }
type OptionValue =
  | { kind: "enabled"; id: string; name: string; path: string }
  | { kind: "disabled"; entry: DisabledEntry }

export function DialogBeshir() {
  const dialog = useDialog()
  const data = useData()
  const location = useLocation()
  const paths = useTuiPaths()
  const toast = useToast()

  dialog.setSize("large")
  const manifest = () => path.join(paths.state, "beshir-skills.json")
  const [disabled, setDisabled] = createSignal<DisabledEntry[]>([])
  const [busy, setBusy] = createSignal(false)

  onMount(() => {
    void readManifest()
      .then(setDisabled)
      .catch(() => setDisabled([]))
  })

  async function readManifest(): Promise<DisabledEntry[]> {
    const raw = await readFile(manifest(), "utf8").catch(() => undefined)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { disabled?: unknown }
    if (!Array.isArray(parsed.disabled)) return []
    return parsed.disabled.flatMap((item): DisabledEntry[] => {
      if (typeof item !== "object" || item === null) return []
      const record = item as Partial<DisabledEntry>
      if (typeof record.id !== "string" || typeof record.name !== "string" || typeof record.path !== "string") return []
      return [{ id: record.id, name: record.name, path: record.path }]
    })
  }

  async function writeManifest(entries: DisabledEntry[]) {
    await mkdir(paths.state, { recursive: true })
    await writeFile(manifest(), JSON.stringify({ disabled: entries }, null, 2))
  }

  const enabled = createMemo(() => data.location.skill.list(location.ref) ?? [])
  const options = createMemo<DialogSelectOption<OptionValue>[]>(() => [
    ...enabled().map((skill) => ({
      title: skill.name,
      description: skill.description?.replace(/\s+/g, " ").trim(),
      footer: "on",
      value: { kind: "enabled" as const, id: skill.id, name: skill.name, path: skill.path },
    })),
    ...disabled().map((entry) => ({
      title: entry.name,
      footer: "off",
      value: { kind: "disabled" as const, entry },
    })),
  ])

  async function toggle(option: DialogSelectOption<OptionValue>) {
    if (busy()) return
    setBusy(true)
    try {
      if (option.value.kind === "enabled") {
        const target = option.value
        await rename(target.path, `${target.path}.disabled`)
        const next = [
          ...disabled().filter((item) => item.id !== target.id),
          { id: target.id, name: target.name, path: target.path },
        ]
        await writeManifest(next)
        setDisabled(next)
        toast.show({ message: `Disabled ${target.name}`, variant: "info" })
      } else {
        const entry = option.value.entry
        await rename(`${entry.path}.disabled`, entry.path)
        const next = disabled().filter((item) => item.id !== entry.id)
        await writeManifest(next)
        setDisabled(next)
        toast.show({ message: `Enabled ${entry.name}`, variant: "info" })
      }
      await data.location.skill.sync(location.ref).catch(() => {})
    } catch (error) {
      toast.show({ title: "Beshir settings", message: errorMessage(error), variant: "error" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogSelect
      title="Beshir settings · Skills"
      placeholder="Filter skills…"
      options={options()}
      emptyView={<text>No skills found</text>}
      onSelect={(option) => void toggle(option)}
      footerHints={[{ title: "enter", label: "on / off" }]}
      footer={<text>Enter toggles the selected skill. Disabled skills are renamed to *.disabled.</text>}
    />
  )
}
