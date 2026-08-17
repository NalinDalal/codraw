/**
 * Text measurement utilities using actual canvas font metrics.
 *
 * Uses a shared offscreen canvas to measure text width/height accurately,
 * avoiding the character-count approximation.
 */

let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureContext(): CanvasRenderingContext2D | null {
    if (typeof document === "undefined") return null;
    if (measureCtx) return measureCtx;
    try {
        const canvas = document.createElement("canvas");
        measureCtx = canvas.getContext("2d")!;
        return measureCtx;
    } catch {
        return null;
    }
}

/**
 * Measure text dimensions using the same font rendering as the canvas.
 *
 * @param text - The text to measure
 * @param fontSize - Font size in pixels
 * @param fontFamily - Font family name
 * @param bold - Whether the text is bold
 * @param italic - Whether the text is italic
 * @returns Measured width and height in canvas units
 */
export function measureText(
    text: string,
    fontSize: number,
    fontFamily: string,
    bold = false,
    italic = false,
): { width: number; height: number } {
    const ctx = getMeasureContext();
    if (!ctx) {
        const boldFactor = bold ? 1.15 : 1;
        return { width: text.length * fontSize * 0.6 * boldFactor, height: fontSize * 1.25 };
    }
    const weight = bold ? "bold " : "";
    const style = italic ? "italic " : "";
    ctx.font = `${style}${weight}${fontSize}px ${fontFamily}`;
    const metrics = ctx.measureText(text);
    const width = metrics.width;
    const height = fontSize * 1.25;
    return { width, height };
}

/**
 * Measure multiline text dimensions.
 *
 * @param text - The text to measure (may contain newlines)
 * @param fontSize - Font size in pixels
 * @param fontFamily - Font family name
 * @param bold - Whether the text is bold
 * @param italic - Whether the text is italic
 * @returns Measured width (max line width) and total height
 */
export function measureMultilineText(
    text: string,
    fontSize: number,
    fontFamily: string,
    bold = false,
    italic = false,
): { width: number; height: number } {
    const lines = text.split("\n");
    let maxWidth = 0;
    for (const line of lines) {
        const { width } = measureText(line, fontSize, fontFamily, bold, italic);
        if (width > maxWidth) maxWidth = width;
    }
    const lineHeight = fontSize * 1.25;
    return { width: maxWidth, height: lines.length * lineHeight };
}
