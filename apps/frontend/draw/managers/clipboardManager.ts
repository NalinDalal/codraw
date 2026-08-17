import { offsetShapeCopy, Shape } from "@repo/shapes";
import { ImageCache } from "../imageCache";
import type { GameContext } from "../gameContext";

/** Capabilities the ClipboardManager needs from the owning Game instance. */
export interface ClipboardManagerApi {
    roomId: string;
    imageCache: ImageCache;
}

/**
 * Clipboard operations and cross-tab clipboard sharing.
 *
 * Manages the internal shape clipboard, BroadcastChannel sync across
 * tabs, pending-paste flag, and system-clipboard image pasting.
 */
export class ClipboardManager {
    private clipboard: Shape[] = [];
    private clipboardChannel: BroadcastChannel | null = null;
    private _pendingPaste = false;
    private pasteHandler = ((_e: ClipboardEvent) => { }) as (e: ClipboardEvent) => void;

    constructor(
        private context: GameContext,
        private api: ClipboardManagerApi,
    ) {}

    get pendingPaste(): boolean {
        return this._pendingPaste;
    }

    set pendingPaste(v: boolean) {
        this._pendingPaste = v;
    }

    /** Initialize BroadcastChannel for cross-tab clipboard sharing. */
    initClipboardChannel() {
        try {
            this.clipboardChannel = new BroadcastChannel(`codraw-clipboard-${this.api.roomId}`);
            this.clipboardChannel.onmessage = (event) => {
                if (event.data?.type === "copy" && Array.isArray(event.data.shapes)) {
                    this.clipboard = event.data.shapes;
                }
            };
        } catch {
            // BroadcastChannel not supported; cross-tab clipboard sharing is disabled
        }
    }

    /** Copy all selected shapes to the internal clipboard. */
    copySelectedShape() {
        if (this.context.selectedIds.size === 0) return;
        this.clipboard = [];
        for (const id of this.context.selectedIds) {
            const shape = this.context.existingShapes.find((s) => s.id === id);
            if (shape) this.clipboard.push(JSON.parse(JSON.stringify(shape)));
        }
        // Bound text is part of its container: always copy it along so a
        // paste never ships a dangling boundTextId.
        const copiedIds = new Set(this.clipboard.map((s) => s.id).filter(Boolean));
        for (const shape of this.clipboard) {
            if (shape.boundTextId && !copiedIds.has(shape.boundTextId)) {
                const bound = this.context.existingShapes.find((s) => s.id === shape.boundTextId);
                if (bound) this.clipboard.push(JSON.parse(JSON.stringify(bound)));
            }
        }
        this.broadcastClipboard();
    }

    /** Broadcast the current clipboard to other tabs. */
    private broadcastClipboard() {
        if (!this.clipboardChannel || this.clipboard.length === 0) return;
        try {
            this.clipboardChannel.postMessage({ type: "copy", shapes: this.clipboard });
        } catch {
            // Channel closed or unavailable
        }
    }

    /** Paste clipboard contents with a 20px offset from originals. */
    pasteClipboard() {
        if (this.clipboard.length === 0) return;
        const offset = 20;
        for (const original of this.clipboard) {
            const copy = JSON.parse(JSON.stringify(original)) as Shape;
            offsetShapeCopy(copy, offset);
            delete copy.groupId;
            this.context.shapeManager.commitShape(copy);
        }
    }

    /** Handle pasting external content from the system clipboard. */
    async pasteExternal(e: ClipboardEvent): Promise<boolean> {
        if (!e.clipboardData) return false;
        const items = e.clipboardData.items;
        let svgItem: DataTransferItem | null = null;
        let imageItem: DataTransferItem | null = null;

        for (const item of items) {
            if (item.type === "image/svg+xml") {
                svgItem = item;
                break;
            }
            if (item.type.startsWith("image/") && !imageItem) {
                imageItem = item;
            }
        }

        const item = svgItem || imageItem;
        if (!item) return false;

        try {
            const blob = item.getAsFile();
            if (!blob) return false;
            const text = await blob.text();
            let svgText = text;
            if (item.type === "text/html") {
                const match = text.match(/<svg[\s\S]*?<\/svg>/i);
                if (!match) return false;
                svgText = match[0];
            }
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgText, "image/svg+xml");
            const svgEl = doc.querySelector("svg");
            if (!svgEl) return false;

            const width = parseFloat(svgEl.getAttribute("width") || "200");
            const height = parseFloat(svgEl.getAttribute("height") || "200");

            const svgBlob = new Blob([svgText], { type: "image/svg+xml" });
            const url = URL.createObjectURL(svgBlob);
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => {
                    URL.revokeObjectURL(url);
                    resolve();
                };
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error("Failed to load SVG"));
                };
                img.src = url;
            });

            const maxDim = 600;
            const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
            const w = img.naturalWidth * scale;
            const h = img.naturalHeight * scale;

            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = Math.max(1, Math.round(w));
            tempCanvas.height = Math.max(1, Math.round(h));
            const tempCtx = tempCanvas.getContext("2d");
            if (!tempCtx) return false;
            tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
            const dataUrl = tempCanvas.toDataURL("image/png");

            const [cx, cy] = this.context.viewport.getCanvasCoords(
                this.context.cssWidth / 2,
                this.context.cssHeight / 2,
            );
            const shape: Shape = {
                type: "image",
                x: cx - w / 2,
                y: cy - h / 2,
                width: w,
                height: h,
                imageData: dataUrl,
                style: { ...this.context.currentStyle },
            };
            this.api.imageCache.set(dataUrl, img);
            this.context.shapeManager.commitShape(shape);
            return true;
        } catch {
            console.error("Failed to paste SVG");
            return false;
        }
    }

    /** Register the paste event listener on the canvas. */
    initPasteHandler(canvas: HTMLCanvasElement) {
        this.pasteHandler = (e: ClipboardEvent) => {
            if (this.context.textManager.hasTextEditOverlay) return;
            const wasPending = this._pendingPaste;
            this._pendingPaste = false;
            void this.pasteExternal(e).then((wasExternal) => {
                if (!wasExternal && wasPending) {
                    this.pasteClipboard();
                }
            });
        };
        canvas.addEventListener("paste", this.pasteHandler);
    }

    /** Close the BroadcastChannel and release resources. */
    destroy(canvas?: HTMLCanvasElement) {
        if (canvas) canvas.removeEventListener("paste", this.pasteHandler);
        try {
            this.clipboardChannel?.close();
        } catch {
            // ignore
        }
    }
}
