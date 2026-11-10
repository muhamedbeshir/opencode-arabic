/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { TextTableRenderable, SyntaxStyle } from "@opentui/core"
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

// @opentui 0.8 paints editor nodes through the native scene, so the captured
// frame of `testRender` cannot see textarea content at all: the stock textarea
// is blank there too. Assert what the harness can still prove - the single-line
// input takes the bidi path, and the RTL textarea paints exactly what the stock
// painter does (it never paints less).
test("the input renders RTL and the textarea matches the stock painter", async () => {
  await using input = await testRender(() => <bidi_input value={logical} />, { width: 24, height: 1 })
  await input.renderOnce()
  expect(hasRtl(input.captureCharFrame())).toBe(true)

  await using stock = await testRender(() => <textarea initialValue={logical} />, { width: 24, height: 2 })
  await stock.renderOnce()
  const stockFrame = stock.captureCharFrame()

  await using bidi = await testRender(() => <bidi_textarea initialValue={logical} />, { width: 24, height: 2 })
  await bidi.renderOnce()
  expect(bidi.captureCharFrame()).toBe(stockFrame)
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

// The bidi cell painter is a prototype override keyed by the paint entry point
// the installed @opentui exposes. When that name changes, the override stops
// being called and tables quietly fall back to logical order (Arabic reads
// backwards), which no type check catches: assert the install landed.
test("table paint is installed on the entry point the core exposes", () => {
  const proto = TextTableRenderable.prototype as unknown as { __bidiTable?: string; [key: string]: unknown }
  const entry = proto.__bidiTable
  expect(entry === "drawCells" || entry === "drawCellRange").toBe(true)
  expect(typeof proto[entry!]).toBe("function")
})

// A cell that wraps must stay inside the row height the native layout measured.
// The bidi wrapper produces the line breaks, so an off-by-one there paints over
// the bottom border and into the next row (the "broken table" symptom).
test("a wrapped RTL cell does not paint over the row border", async () => {
  const wrapping = [
    "| العمود | الوصف |",
    "| --- | --- |",
    "| الملخص | هذه خلية نصها طويل جدا لكي يلتف على أكثر من سطر داخل الجدول |",
  ].join("\n")
  await using md = await testRender(
    () => {
      const renderer = useRenderer()
      const syntaxStyle = SyntaxStyle.fromStyles({ default: { fg: "#ffffff" } }, renderer.nativeScene)
      return (
        <markdown
          syntaxStyle={syntaxStyle}
          content={wrapping}
          streaming={false}
          internalBlockMode="top-level"
          tableOptions={{ style: "grid", cellPaddingX: 1 }}
        />
      )
    },
    { width: 44, height: 10, remote: true },
  )
  const frame = await settledFrame(md, hasRtl)
  const bottom = frame.split("\n").filter((line) => line.includes("└"))
  expect(bottom).toHaveLength(1)
  expect(bottom[0]).toMatch(/^[└┴┘─]+$/)
})
