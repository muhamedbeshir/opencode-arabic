import {
  CodeRenderable,
  MarkdownRenderable,
  TextBuffer,
  TextTableRenderable,
  type ChunkRenderContext,
  type OnChunksCallback,
  type OptimizedBuffer,
  type RGBA,
  type TextBufferView,
  type TextChunk,
} from "@opentui/core"
import { hasRtl, layoutBidiText, paintBidiCell, widthOffsetToBoundary, wrappedLogicalText, type BidiLayout } from "../util/bidi"

// Markdown bidi painting, installed once on CodeRenderable itself so every
// markdown-prose block inherits it: top-level paragraphs and headings, list
// items, blockquotes and table fallbacks. OpenTUI builds those code blocks
// internally (list rows and streaming updates never consult renderNode), so
// per-instance patching always misses surfaces; the prototype sees them all.
//
// Only blocks whose content carries strong RTL characters AND whose filetype
// is unset or "markdown" take the bidi path. Fenced code blocks carry a real
// filetype and English-only blocks have no RTL, so both keep the stock
// painter bit-for-bit. The logical string is never mutated: isolates live in
// a layout-only stream, and the native buffer only ever holds wrapped logical
// text, so selection and copy keep working.

type StyledSource = {
  text: string
  chunks: TextChunk[]
  // Char offset where each chunk starts within text.
  offsets: number[]
}

type BidiCodeState = {
  styled: StyledSource | undefined
  layout: BidiLayout | undefined
  // Logical source text of the current layout (pre-wrap).
  source: string
  wrapped: string | undefined
  width: number
  // Bumped on every captured chunk update so style-only changes (same text,
  // new styles) still rebuild the layout instead of painting a stale one.
  styledVersion: number
  paintedVersion: number
  chunksWrapper: OnChunksCallback | undefined
}

const blockStates = new WeakMap<CodeRenderable, BidiCodeState>()
let prototypePatched = false

// Protected members of TextBufferRenderable needed for buffer sync, plus
// the highlight machinery. startHighlight/_highlightsDirty are private in
// the .d.ts but public at runtime; these shapes only widen the TypeScript
// view. Coupled to @opentui/core 0.4.5 (see script/upgrade-opentui.ts when
// bumping).
type CodeInternals = {
  textBuffer: TextBuffer
  plainText: string
  updateTextInfo(): void
  startHighlight(): void
  _highlightsDirty?: boolean
}

function blockState(renderable: CodeRenderable) {
  let state = blockStates.get(renderable)
  if (!state) {
    state = {
      styled: undefined,
      layout: undefined,
      source: "",
      wrapped: undefined,
      width: 0,
      styledVersion: 0,
      paintedVersion: -1,
      chunksWrapper: undefined,
    }
    blockStates.set(renderable, state)
  }
  return state
}

function proseFiletype(renderable: CodeRenderable) {
  return (renderable as unknown as { filetype?: unknown }).filetype
}

// Wraps onChunks once per instance so tree-sitter styled chunks are captured
// for the paint below. Assigning marks highlights dirty, which restarts
// highlighting through the wrapper; afterwards the installed wrapper is
// detected and left alone, so this converges instead of looping.
function ensureChunksWrapped(renderable: CodeRenderable, state: BidiCodeState) {
  const current = renderable.onChunks
  if (current === state.chunksWrapper) return
  const previous = current
  const wrapper: OnChunksCallback = async (chunks: TextChunk[], context: ChunkRenderContext) => {
    const result = previous ? await previous(chunks, context) : undefined
    const captured = result ?? chunks
    let text = ""
    const offsets: number[] = []
    for (const chunk of captured) {
      offsets.push(text.length)
      text += chunk.text
    }
    state.styled = { text, chunks: captured, offsets }
    state.styledVersion++
    state.layout = undefined
    state.wrapped = undefined
    return result
  }
  state.chunksWrapper = wrapper
  renderable.onChunks = wrapper
}

// 0.6.x paints text through the native scene, which captures each class's
// prototype.renderSelf at definition time — replacing the prototype method is
// therefore ignored (prose rendered in logical order). Markdown builds every
// prose block through createMarkdownCodeRenderable, which the captured render
// body dispatches through `this`, so wrapping it and attaching a per-instance
// paint (own properties ARE honored by the scene) reaches paragraphs, headings,
// list items, blockquotes and streaming updates alike.
export function installBidiCodePaint() {
  if (prototypePatched) return
  prototypePatched = true
  const proto = MarkdownRenderable.prototype as unknown as {
    createMarkdownCodeRenderable: (...args: unknown[]) => CodeRenderable
  }
  const stock = proto.createMarkdownCodeRenderable
  proto.createMarkdownCodeRenderable = function (...args: unknown[]) {
    const renderable = stock.apply(this, args)
    attachBidiCodePaint(renderable)
    return renderable
  }
}

type CodePaintable = CodeRenderable & { renderSelf: (buffer: OptimizedBuffer) => void }

// The captured native paint body: on 0.6.2 the scene registered this exact
// function at class-definition time, so calling it directly reproduces the
// stock render for non-RTL blocks.
const stockCodeRenderSelf = (CodeRenderable.prototype as unknown as {
  renderSelf: (this: CodeRenderable, buffer: OptimizedBuffer) => void
}).renderSelf

// Attaches the bidi paint to one code renderable. Real-code blocks (any real
// filetype) keep the stock painter bit-for-bit; markdown prose without RTL
// defers at paint time inside paintBidiBlock.
export function attachBidiCodePaint(renderable: CodeRenderable) {
  const filetype = proseFiletype(renderable)
  if (filetype !== undefined && filetype !== "markdown") return
  ;(renderable as CodePaintable).renderSelf = (buffer: OptimizedBuffer) => {
    const state = blockState(renderable)
    ensureChunksWrapped(renderable, state)
    paintBidiBlock(renderable, state, buffer, () => stockCodeRenderSelf.call(renderable, buffer))
  }
}

// Catalogue override so JSX <code> surfaces (inline markdown snippets rendered
// outside MarkdownRenderable) get the same treatment.
export class BidiCodeRenderable extends CodeRenderable {
  constructor(...args: ConstructorParameters<typeof CodeRenderable>) {
    super(...args)
    attachBidiCodePaint(this)
  }
}

function paintBidiBlock(
  renderable: CodeRenderable,
  state: BidiCodeState,
  buffer: OptimizedBuffer,
  paintStock: () => void,
) {
  const internals = renderable as unknown as CodeInternals
  const content = renderable.content
  const plain = internals.plainText
  // The buffer may hold our pre-wrapped text; recover the logical source.
  const current = state.wrapped !== undefined && plain === state.wrapped ? state.source : plain
  if (!hasRtl(content) || renderable.width <= 0) {
    if (state.wrapped !== undefined) {
      if (plain !== content) {
        internals.textBuffer.setText(content)
        internals.updateTextInfo()
      }
      state.wrapped = undefined
      state.layout = undefined
    }
    paintStock()
    return
  }

    if (
      state.source !== current ||
      state.width !== renderable.width ||
      state.paintedVersion !== state.styledVersion
    ) {
      state.source = current
      state.width = renderable.width
      state.paintedVersion = state.styledVersion
      state.layout = layoutBidiText(current, renderable.width)
      state.wrapped = wrappedLogicalText(state.layout)
    }

    // The patched paint replaces Code's renderSelf, which normally starts
    // tree-sitter highlighting when dirty. Mirror that kickoff exactly
    // (clear the flag synchronously, then start) so syntax colors keep
    // flowing for RTL blocks on content, theme, and conceal changes.
    if (internals._highlightsDirty) {
      internals._highlightsDirty = false
      internals.startHighlight()
    }

    if (plain !== state.wrapped) {
      internals.textBuffer.setText(state.wrapped ?? current)
      internals.updateTextInfo()
    }
    paintStyledLines(buffer, state, renderable)
  }

function paintStyledLines(buffer: OptimizedBuffer, state: BidiCodeState, renderable: CodeRenderable) {
  const layout = state.layout
  if (!layout) return
  // Styles apply only when the captured chunk text still matches the layout
  // source; otherwise the paint falls back to the renderable defaults (the
  // brief streaming window before tree-sitter styling lands).
  const styled = state.styled && state.styled.text === state.source ? state.styled : undefined
  const defaultFg = renderable.fg
  const defaultBg = renderable.bg
  const defaultAttributes = renderable.attributes
  const selection = renderable.getSelection()
  const selectionFg = renderable.selectionFg ?? defaultFg
  const selectionBg = renderable.selectionBg ?? defaultBg
  const selStart = selection ? widthOffsetToBoundary(layout, selection.start) : -1
  const selEnd = selection ? widthOffsetToBoundary(layout, selection.end) : -1
  const width = renderable.width
  for (let i = 0; i < layout.lines.length; i++) {
    const line = layout.lines[i]
    const y = renderable.screenY + i
    if (y < 0 || y >= buffer.height) continue
    const x0 = line.rtl ? renderable.screenX + width - line.width : renderable.screenX
    for (const cell of line.cells) {
      const x = x0 + cell.col
      if (x < 0 || x >= buffer.width) continue
      const chunk = styled ? chunkAt(styled, layout.glyphs[cell.glyph].charIndex) : undefined
      const selected = selStart >= 0 && cell.glyph >= selStart && cell.glyph < selEnd
      paintBidiCell(
        buffer,
        x,
        y,
        cell.char,
        selected ? selectionFg : (chunk?.fg ?? defaultFg),
        selected ? selectionBg : (chunk?.bg ?? defaultBg),
        chunk?.attributes ?? defaultAttributes,
      )
    }
  }
}

function chunkAt(source: StyledSource, charIndex: number) {
  let lo = 0
  let hi = source.offsets.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (source.offsets[mid] <= charIndex) lo = mid
    else hi = mid - 1
  }
  const chunk = source.chunks[lo]
  return chunk && charIndex < source.offsets[lo] + chunk.text.length ? chunk : undefined
}

// Markdown tables are drawn by @opentui/core's TextTableRenderable, which paints
// each cell with the native (BiDi-unaware) drawTextBuffer. It never goes through
// CodeRenderable, so the prose painter above cannot reach it and cell content is
// emitted in logical order (Arabic reads reversed). This installs a cell painter:
// any cell whose logical text carries strong RTL is laid out with UAX #9 and
// painted cell-by-cell, right-aligned per RTL line, so Arabic reads naturally
// without disturbing the grid, borders or column widths. Reordered cells fall
// back to the table defaults for styling because per-run styles live in the
// native buffer and are not readable from JS.

type TableCell = {
  textBuffer: { getPlainText(): string }
  textBufferView: TextBufferView
}

type TableInternals = {
  _cells: Array<Array<TableCell | undefined>>
  _columnCount: number
  _cellPaddingX: number
  _cellPaddingY: number
  _defaultFg: RGBA
  _defaultBg: RGBA
  _defaultAttributes: number
  _layout: { columnOffsets: number[]; rowOffsets: number[]; columnWidths: number[] }
  getHorizontalCellPadding(): number
}

type TableCellLayout = {
  text: string
  width: number
  lines: BidiLayout["lines"]
}

const tableCellLayouts = new WeakMap<TableCell, TableCellLayout>()

function tableLines(cell: TableCell, text: string, width: number) {
  const cached = tableCellLayouts.get(cell)
  if (cached && cached.text === text && cached.width === width) return cached.lines
  const lines = layoutBidiText(text, width).lines
  tableCellLayouts.set(cell, { text, width, lines })
  return lines
}

export function installBidiTablePaint() {
  const proto = TextTableRenderable.prototype as unknown as {
    drawCellRange(buffer: OptimizedBuffer, firstRow: number, lastRow: number): void
    __bidiTable?: boolean
  }
  if (proto.__bidiTable) return
  proto.__bidiTable = true
  const stock = proto.drawCellRange
  proto.drawCellRange = function (this: TextTableRenderable, buffer, firstRow, lastRow) {
    const table = this as unknown as TableInternals
    const hasRtlCell = table._cells.some((row) =>
      row.some((cell) => !!cell && hasRtl(cell.textBuffer.getPlainText())),
    )
    if (!hasRtlCell) {
      stock.call(this, buffer, firstRow, lastRow)
      return
    }
    const colOffsets = table._layout.columnOffsets
    const rowOffsets = table._layout.rowOffsets
    const columnWidths = table._layout.columnWidths
    const contentPadding = table.getHorizontalCellPadding()
    const fg = table._defaultFg
    const bg = table._defaultBg
    const attributes = table._defaultAttributes
    for (let rowIdx = firstRow; rowIdx <= lastRow; rowIdx++) {
      const row = table._cells[rowIdx]
      if (!row) continue
      const cellY = (rowOffsets[rowIdx] ?? 0) + 1 + table._cellPaddingY
      for (let colIdx = 0; colIdx < table._columnCount; colIdx++) {
        const cell = row[colIdx]
        if (!cell) continue
        const x = (colOffsets[colIdx] ?? 0) + 1 + table._cellPaddingX
        const text = cell.textBuffer.getPlainText()
        if (!hasRtl(text)) {
          buffer.drawTextBuffer(cell.textBufferView, x, cellY)
          continue
        }
        const contentWidth = Math.max(1, (columnWidths[colIdx] ?? 1) - contentPadding)
        const lines = tableLines(cell, text, contentWidth)
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          const y = cellY + i
          if (y < 0 || y >= buffer.height) continue
          const x0 = x + (line.rtl ? Math.max(0, contentWidth - line.width) : 0)
          for (const part of line.cells) {
            if (part.col >= contentWidth) continue
            const cellX = x0 + part.col
            if (cellX < 0 || cellX >= buffer.width) continue
            paintBidiCell(buffer, cellX, y, part.char, fg, bg, attributes)
          }
        }
      }
    }
  }
}
