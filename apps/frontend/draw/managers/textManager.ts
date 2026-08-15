import { Shape, TextShape, getShapeBounds } from "@repo/shapes";
import { startTextEdit, removeTextOverlayFn, TextStyleOptions } from "../inputHandler";
import type { GameContext } from "../gameContext";

/** Capabilities the TextManager needs from the owning Game instance. */
export interface TextManagerApi {
    syncShapes(): void;
    commitShape(shape: Shape, autoSwitchToSelect?: boolean): void;
    invalidateCache(): void;
    clearCanvas(): void;
    setClicked(v: boolean): void;
}

/**
 * Text-specific behavior: the text formatting state for new shapes, the
 * inline text-area editing overlay, and bound-text repositioning.
 *
 * The textarea itself is created by the shared `startTextEdit` helper;
 * this manager owns its lifecycle and the transient pending-bound state
 * that links a newly created text shape to its container.
 */
export class TextManager {
    private textEditOverlay: HTMLTextAreaElement | null = null;
    /** Tracks the container shape ID whose bound text is currently being created (null when idle) */
    pendingBoundTextContainerId: string | null = null;

    /** Whether a text editing textarea is currently in the DOM. */
    get hasTextEditOverlay(): boolean {
        return this.textEditOverlay !== null;
    }

    // Text formatting state
    private _textBold = false;
    private _textItalic = false;
    private _textFontFamily = "Arial";
    private _textFontSize = 20;
    private _textAlign: "left" | "center" | "right" = "left";

    constructor(
        private context: GameContext,
        private api: TextManagerApi,
    ) {}

    private shapeById(id: string): Shape | undefined {
        return this.context.existingShapes.find((s) => s.id === id) ?? this.context.trash.find((s) => s.id === id);
    }

    /** Whether new text will be bold */
    get textBold(): boolean { return this._textBold; }
    set textBold(v: boolean) { this._textBold = v; }

    /** Whether new text will be italic */
    get textItalic(): boolean { return this._textItalic; }
    set textItalic(v: boolean) { this._textItalic = v; }

    /** Font family for new text shapes */
    get textFontFamily(): string { return this._textFontFamily; }
    set textFontFamily(v: string) { this._textFontFamily = v; }

    /** Font size for new text shapes */
    get textFontSize(): number { return this._textFontSize; }
    set textFontSize(v: number) { this._textFontSize = v; }

    /** Text alignment for new text shapes */
    get textAlign(): "left" | "center" | "right" { return this._textAlign; }
    set textAlign(v: "left" | "center" | "right") { this._textAlign = v; }

    /** Get the current text formatting state */
    getTextStyle(): TextStyleOptions {
        return {
            bold: this._textBold,
            italic: this._textItalic,
            fontFamily: this._textFontFamily,
            fontSize: this._textFontSize,
            textAlign: this._textAlign,
        };
    }

    /**
     * Remove the text editing textarea overlay from the DOM.
     *
     * Delegates to {@link removeTextOverlayFn} and clears the local
     * reference so subsequent edit sessions start fresh.
     */
    removeTextOverlay() {
        removeTextOverlayFn(this.textEditOverlay);
        this.textEditOverlay = null;
    }

    /**
     * Reposition a text shape that is bound to a container shape.
     *
     * Keeps the bound text centered (or aligned) within the container's
     * current bounds whenever the container is moved, resized, or otherwise
     * transformed.
     *
     * If the referenced text shape no longer exists, the binding is cleared.
     *
     * @param movedShapeId - The container shape ID whose bound text should be updated
     */
    updateBoundText(movedShapeId: string) {
        const shape = this.shapeById(movedShapeId);
        if (!shape || !shape.boundTextId) return;
        const bounds = getShapeBounds(shape);
        if (!bounds) return;
        const textShape = this.context.existingShapes.find(s => s.id === shape.boundTextId && s.type === "text");
        if (!textShape) {
            delete shape.boundTextId;
            return;
        }
        const cx = bounds.x + bounds.w / 2;
        const cy = bounds.y + bounds.h / 2;
        const ts = textShape as TextShape;
        if (ts.textAlign === "center") {
            ts.x = cx;
        } else if (ts.textAlign === "right") {
            ts.x = bounds.x + bounds.w;
        } else {
            ts.x = bounds.x;
        }
        ts.y = cy - ts.fontSize / 2;
    }

    /**
     * Create an inline textarea for editing text shapes.
     * @param canvasX - X position in canvas coordinates
     * @param canvasY - Y position in canvas coordinates
     * @param existingText - Pre-filled text for editing, or undefined for new text
     * @param existingIndex - Index in the shapes array if editing, or undefined for new text
     * @param textStyle - Formatting options for new text shapes
     */
    startTextEdit(
        canvasX: number,
        canvasY: number,
        existingText?: string,
        existingIndex?: number,
        textStyle?: TextStyleOptions,
    ) {
        this.textEditOverlay = startTextEdit(
            canvasX,
            canvasY,
            this.context.viewport.zoom,
            this.context.viewport.panX,
            this.context.viewport.panY,
            this.context.isDark,
            existingText,
            existingIndex,
            {
                removeTextOverlay: () => this.removeTextOverlay(),
                pushUndo: (prev) => this.context.undoManager.push(prev, this.context.existingShapes),
                syncShapes: () => this.api.syncShapes(),
                commitShape: (shape) => this.api.commitShape(shape),
                setClicked: (v) => this.api.setClicked(v),
                invalidateAndRedraw: () => {
                    this.api.invalidateCache();
                    this.api.clearCanvas();
                },
                onTextCleared: (textIndex) => {
                    const textShape = this.context.existingShapes[textIndex];
                    if (!textShape || textShape.type !== "text") return;
                    const container = this.context.existingShapes.find(
                        s => s.boundTextId === textShape.id,
                    );
                    if (container) {
                        delete container.boundTextId;
                    }
                    const prev = [...this.context.existingShapes];
                    this.context.existingShapes = this.context.existingShapes.filter(s => s.id !== textShape.id);
                    this.context.undoManager.push(prev, this.context.existingShapes);
                    this.api.syncShapes();
                },
                onTextEditCancelled: () => {
                    this.pendingBoundTextContainerId = null;
                },
            },
            this.context.existingShapes,
            textStyle,
        );
    }
}