/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { SyntaxStyle } from "@opentui/core"
import { testRender, useRenderer } from "@opentui/solid"
import { hasRtl } from "../../src/util/bidi"
import "../../src/component/bidi-elements"

const logical = "مرحبا بالعالم"
const reversed = [...logical].reverse().join("")
const table = ["| الاسم | العمر |", "| --- | --- |", "| أحمد | 30 |"].join("\n")

// Markdown paints nothing until the shared tree-sitter worker answers, and that
// round trip is not tied to frames, so poll the captured frame on a wall clock
// instead of spending a frame pass budget (see .opencode/skills/tui-tests).
async function settledFrame(app: Awaited<ReturnType<typeof testRender>>, predicate: (frame: string) => boolean) {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    await app.renderOnce()
    const frame = app.captureCharFrame()
    if (predicate(frame)) return frame
    await Bun.sleep(10)
  }
  return app.captureCharFrame()
}

test("the text element reorders RTL and leaves English alone", async () => {
  await using rtl = await testRender(() => <bidi_text content={logical} />, { width: 24, height: 2 })
  await rtl.renderOnce()
  expect(rtl.captureCharFrame().split("\n")[0].trim()).toBe(reversed)

  await using ltr = await testRender(() => <bidi_text content="Hello world" />, { width: 24, height: 2 })
  await ltr.renderOnce()
  expect(ltr.captureCharFrame().split("\n")[0].trim()).toBe("Hello world")
})

test("the input and textarea elements render RTL", async () => {
  await using textarea = await testRender(() => <bidi_textarea initialValue={logical} />, { width: 24, height: 2 })
  await textarea.renderOnce()
  expect(hasRtl(textarea.captureCharFrame())).toBe(true)

  await using input = await testRender(() => <bidi_input value={logical} />, { width: 24, height: 1 })
  await input.renderOnce()
  expect(hasRtl(input.captureCharFrame())).toBe(true)
})

// Markdown prose is painted by the per-instance renderSelf override installed in
// src/component/bidi-markdown.ts. A renderer that stops dispatching own-property
// paint hooks silently drops the override and prose falls back to logical order,
// which is invisible to type checking: this asserts the dispatch itself.
test("markdown prose paints RTL", async () => {
  await using md = await testRender(
    () => {
      const renderer = useRenderer()
      const syntaxStyle = SyntaxStyle.fromStyles({ default: { fg: "#ffffff" } }, renderer.nativeScene)
      return <markdown syntaxStyle={syntaxStyle} content={logical} streaming={false} internalBlockMode="top-level" />
    },
    { width: 32, height: 3, remote: true },
  )
  const frame = await settledFrame(md, hasRtl)
  expect(frame.split("\n")[0].trim()).toBe(reversed)
})

test("markdown table cells paint RTL", async () => {
  await using md = await testRender(
    () => {
      const renderer = useRenderer()
      const syntaxStyle = SyntaxStyle.fromStyles({ default: { fg: "#ffffff" } }, renderer.nativeScene)
      return (
        <markdown
          syntaxStyle={syntaxStyle}
          content={table}
          streaming={false}
          internalBlockMode="top-level"
          tableOptions={{ style: "grid", cellPaddingX: 1 }}
        />
      )
    },
    { width: 32, height: 8, remote: true },
  )
  const frame = await settledFrame(md, hasRtl)
  expect(frame).toContain([..."الاسم"].reverse().join(""))
})
