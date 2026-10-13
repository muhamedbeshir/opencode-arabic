import { TextRenderable, type OptimizedBuffer } from "@opentui/core"
import { appendFileSync } from "node:fs"
import { hasRtl, layoutBidiText, paintBidiCell, wrappedLogicalText, type BidiLayout } from "../util/bidi"

// TEMPORARY diagnosis logging for the live-app logical-order regression.
const bidiLogPath = `${process.env.USERPROFILE}\\.local\\state\\opencode\\bidi-text.log`
let bidiLogCount = 0
function bidiLog(message: string) {
  if (bidiLogCount >= 400) return
  bidiLogCount++
  try {
    appendFileSync(bidiLogPath, `${new Date().toISOString()} ${message}\n`)
  } catch {
    // logging must never break rendering
  }
}

// RTL-aware text element for user-authored content (chat input echoes).
// English-only content renders through the stock OpenTUI path untouched; the
// bidi layout runs only when strong RTL characters are present. The logical
// string is never mutated: the native text buffer is only re-synced to the
// wrapped logical form so measurement, selection and copy keep working.
export class BidiTextRenderable extends TextRenderable {
  private bidiSource: string | undefined
  private bidiWrapped: string | undefined
  private bidiLayout: BidiLayout | undefined
  private bidiWidth = 0

  constructor(...args: ConstructorParameters<typeof TextRenderable>) {
    super(...args)
    bidiLog(`ctor ${this.id}`)
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    const plain = this.plainText
    bidiLog(`text plain=${JSON.stringify(plain.slice(0, 60))} width=${this.width} visible=${this.visible}`)
    if (this.bidiWrapped !== undefined && plain !== this.bidiWrapped && plain !== this.bidiSource) {
      // Content was updated externally; adopt the buffer text as the new
      // logical source before any wrapping decision.
      this.bidiSource = plain
      this.bidiLayout = undefined
    }
    const source = this.bidiSource ?? plain
    if (!hasRtl(source) || this.width <= 0) {
      bidiLog(`  -> native fallback (rtl=${hasRtl(source)} width=${this.width})`)
      this.restoreLogical(source, plain)
      super.renderSelf(buffer)
      return
    }

    if (!this.bidiLayout || this.bidiWidth !== this.width) {
      this.bidiLayout = layoutBidiText(source, this.width)
      this.bidiWidth = this.width
      this.bidiWrapped = wrappedLogicalText(this.bidiLayout)
      this.bidiSource = source
      bidiLog(`  -> bidi paint lines=${this.bidiLayout.lines.length} width=${this.width}`)
    }

    if (plain !== this.bidiWrapped) {
      this.textBuffer.setText(this.bidiWrapped ?? source)
      this.updateTextInfo()
    }

    const layout = this.bidiLayout
    const fg = this.fg
    const bg = this.bg
    const attributes = this.attributes
    for (let i = 0; i < layout.lines.length; i++) {
      const line = layout.lines[i]
      const y = this._screenY + i
      if (y < 0 || y >= buffer.height) continue
      const x0 = line.rtl ? this._screenX + this.width - line.width : this._screenX
      for (const cell of line.cells) {
        const x = x0 + cell.col
        if (x < 0 || x >= buffer.width) continue
        paintBidiCell(buffer, x, y, cell.char, fg, bg, attributes)
      }
    }
  }

  private restoreLogical(source: string, plain: string) {
    if (this.bidiWrapped === undefined || plain !== this.bidiWrapped) return
    this.textBuffer.setText(source)
    this.updateTextInfo()
    this.bidiWrapped = undefined
    this.bidiLayout = undefined
  }
}
