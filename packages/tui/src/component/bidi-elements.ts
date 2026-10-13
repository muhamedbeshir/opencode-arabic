import { extend } from "@opentui/solid"
import { BidiTextRenderable } from "./bidi-text"
import { BidiTextareaRenderable } from "./bidi-textarea"
import { BidiInputRenderable } from "./bidi-input"
import { installBidiCodePaint, installBidiTablePaint } from "./bidi-markdown"

// Registers the bidi-aware elements with the OpenTUI solid catalogue so they
// can be used as <bidi_text> and <bidi_textarea> in JSX. Import this module
// from any component that renders them.
//
// Overriding the built-in `text`, `textarea` and `input` components is what
// makes RTL work "everywhere" without touching every call site: dialogs, lists,
// tool output, toasts, status lines, every multi-line input (question answers,
// permission rejects, dialog prompts) and every single-line input (dialog
// search/filter, command palette, worktree name) render through them. All bidi
// renderables defer to the stock painter whenever the content has no strong
// RTL characters, so English-only output and inputs are unchanged.
//
// installBidiCodePaint does the same for markdown code blocks at the
// CodeRenderable level, which is the only layer that sees list items,
// blockquotes and streaming updates (those paths never consult renderNode).
// installBidiTablePaint handles markdown tables, which use a separate
// TextTableRenderable that never goes through CodeRenderable.
extend({
  text: BidiTextRenderable,
  textarea: BidiTextareaRenderable,
  input: BidiInputRenderable,
  bidi_text: BidiTextRenderable,
  bidi_textarea: BidiTextareaRenderable,
  bidi_input: BidiInputRenderable,
})
installBidiCodePaint()
installBidiTablePaint()

declare module "@opentui/solid" {
  interface OpenTUIComponents {
    bidi_text: typeof BidiTextRenderable
    bidi_textarea: typeof BidiTextareaRenderable
  }
}
