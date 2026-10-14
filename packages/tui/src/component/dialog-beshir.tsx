import { createMemo, createSignal, onMount } from "solid-js"
import { rename } from "node:fs/promises"
import { useData } from "../context/data"
import { useLocation } from "../context/location"
import { useTuiPaths } from "../context/runtime"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { errorMessage } from "../util/error"
import {
  beshirConfigPath,
  beshirSkillsManifestPath,
  readBeshirConfig,
  readDisabledSkills,
  reviewerModel,
  writeDisabledSkills,
  writeReviewerModel,
  type DisabledSkill,
} from "../util/beshir"

export function DialogBeshir() {
  const dialog = useDialog()
  const data = useData()
  const location = useLocation()
  const paths = useTuiPaths()
  const [reviewer, setReviewer] = createSignal<string>()
  const [disabled, setDisabled] = createSignal<DisabledSkill[]>([])

  dialog.setSize("large")
  onMount(() => {
    void readBeshirConfig(beshirConfigPath(paths.home))
      .then((config) => setReviewer(reviewerModel(config)))
      .catch(() => {})
    void readDisabledSkills(beshirSkillsManifestPath(paths.state))
      .then(setDisabled)
      .catch(() => setDisabled([]))
  })

  const enabled = createMemo(() => (data.location.skill.list(location.ref) ?? []).length)
  const options = createMemo<DialogSelectOption<string>[]>(() => [
    {
      title: "Skills",
      description: "Turn individual skills on or off",
      footer: `${enabled()} on · ${disabled().length} off`,
      value: "skills",
    },
    {
      title: "Reviewer model",
      description: "Model the model-review skill uses to critique work before reporting done",
      footer: reviewer() ?? "not set",
      value: "reviewer",
    },
  ])

  return (
    <DialogSelect
      title="Beshir settings"
      options={options()}
      footerHints={[{ title: "enter", label: "open" }]}
      onSelect={(option) => {
        if (option.value === "skills") {
          dialog.replace(() => <DialogBeshirSkills />)
          return
        }
        dialog.replace(() => <DialogBeshirReviewer />)
      }}
    />
  )
}

type SkillValue =
  | { kind: "enabled"; id: string; name: string; path: string }
  | { kind: "disabled"; entry: DisabledSkill }

function DialogBeshirSkills() {
  const dialog = useDialog()
  const data = useData()
  const location = useLocation()
  const paths = useTuiPaths()
  const toast = useToast()
  const manifest = () => beshirSkillsManifestPath(paths.state)
  const [disabled, setDisabled] = createSignal<DisabledSkill[]>([])
  const [busy, setBusy] = createSignal(false)
  const back = () => dialog.replace(() => <DialogBeshir />)

  onMount(() => {
    void readDisabledSkills(manifest())
      .then(setDisabled)
      .catch(() => setDisabled([]))
  })

  const enabled = createMemo(() => data.location.skill.list(location.ref) ?? [])
  const options = createMemo<DialogSelectOption<SkillValue>[]>(() => [
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

  async function toggle(value: SkillValue) {
    if (busy()) return
    setBusy(true)
    try {
      if (value.kind === "enabled") {
        await rename(value.path, `${value.path}.disabled`)
        const next = [...disabled().filter((item) => item.id !== value.id), { id: value.id, name: value.name, path: value.path }]
        await writeDisabledSkills(manifest(), next)
        setDisabled(next)
        toast.show({ message: `Disabled ${value.name}`, variant: "info" })
      } else {
        await rename(`${value.entry.path}.disabled`, value.entry.path)
        const next = disabled().filter((item) => item.id !== value.entry.id)
        await writeDisabledSkills(manifest(), next)
        setDisabled(next)
        toast.show({ message: `Enabled ${value.entry.name}`, variant: "info" })
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
      onCancel={back}
      onSelect={(option) => void toggle(option.value)}
      footerHints={[{ title: "enter", label: "on / off" }]}
      footer={<text>Enter toggles the skill. Disabled skills are renamed to *.disabled.</text>}
    />
  )
}

function DialogBeshirReviewer() {
  const dialog = useDialog()
  const data = useData()
  const location = useLocation()
  const paths = useTuiPaths()
  const toast = useToast()
  const [current, setCurrent] = createSignal<string>()
  const back = () => dialog.replace(() => <DialogBeshir />)

  onMount(() => {
    void readBeshirConfig(beshirConfigPath(paths.home))
      .then((config) => setCurrent(reviewerModel(config)))
      .catch(() => {})
  })

  const options = createMemo<DialogSelectOption<string>[]>(() =>
    (data.location.model.list(location.ref) ?? [])
      .filter((model) => model.status !== "deprecated")
      .map((model) => ({
        title: model.name,
        description: model.providerID,
        category: model.providerID,
        value: `${model.providerID}/${model.id}`,
      })),
  )

  async function choose(model: string) {
    try {
      await writeReviewerModel(beshirConfigPath(paths.home), model)
      toast.show({ message: `Reviewer model set to ${model}`, variant: "info" })
      back()
    } catch (error) {
      toast.show({ title: "Beshir settings", message: errorMessage(error), variant: "error" })
    }
  }

  return (
    <DialogSelect
      title="Beshir settings · Reviewer model"
      placeholder="Filter models…"
      options={options()}
      current={current()}
      emptyView={<text>No models available. Connect a provider first.</text>}
      onCancel={back}
      onSelect={(option) => void choose(option.value)}
      footerHints={[{ title: "enter", label: "set" }]}
    />
  )
}
