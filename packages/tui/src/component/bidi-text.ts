import { TextRenderable, type OptimizedBuffer } from "@opentui/core"
import { bidiSelectionColors, hasRtl, layoutBidiText, paintBidiCell, widthOffsetToBoundary, type BidiLayout } from "../util/bidi"

// RTL-aware text element for user-authored content (chat input echoes, status lines, etc.).
// English-only content renders through the stock OpenTUI path untouched; the
// bidi layout runs only when strong RTL characters are present. The logical
// string is never mutated, preserving copy/paste and selection while preventing
// render/dirty loops.
export class BidiTextRenderable extends TextRenderable {
  private bidiSource: string | undefined
  private bidiLayout: BidiLayout | undefined
  private bidiWidth = 0

  protected override renderSelf(buffer: OptimizedBuffer): void {
    const source = this.plainText
    if (!hasRtl(source) || this.width <= 0) {
      this.bidiLayout = undefined
      this.bidiSource = undefined
      super.renderSelf(buffer)
      return
    }

    if (!this.bidiLayout || this.bidiWidth !== this.width || this.bidiSource !== source) {
      this.bidiLayout = layoutBidiText(source, this.width)
      this.bidiWidth = this.width
      this.bidiSource = source
    }

    const layout = this.bidiLayout
    const fg = this.fg
    const bg = this.bg
    const attributes = this.attributes
    const selection = this.getSelection()
    const selStart = selection ? widthOffsetToBoundary(layout, selection.start) : -1
    const selEnd = selection ? widthOffsetToBoundary(layout, selection.end) : -1
    const selectionColors = selection ? bidiSelectionColors(fg, bg, this.selectionBg, this.selectionFg) : undefined
    for (let i = 0; i < layout.lines.length; i++) {
      const line = layout.lines[i]
      const y = this._screenY + i
      if (y < 0 || y >= buffer.height) continue
      const x0 = line.rtl ? this._screenX + this.width - line.width : this._screenX
      for (const cell of line.cells) {
        const x = x0 + cell.col
        if (x < 0 || x >= buffer.width) continue
        const selected = selStart >= 0 && cell.glyph >= selStart && cell.glyph < selEnd
        const colors = selected ? selectionColors : undefined
        paintBidiCell(buffer, x, y, cell.char, colors?.fg ?? fg, colors?.bg ?? bg, attributes)
      }
    }
  }

  public override getSelectedText(): string {
    return this.bidiSource ?? super.getSelectedText()
  }
}
