import { getShapeBounds, Shape } from "@repo/shapes";
import { moveShape } from "../inputHandler";
import type { GameContext } from "../gameContext";

/** Capabilities the KeyboardManager needs from the owning Game instance. */
export interface KeyboardManagerApi {
    selectedTool: string;
    setTool(tool: string): void;
    setHandPanning(active: boolean): void;
    enterEditAction(): void;
    insertImage(): void;
    copySelectionAsPng(): void;
    cancelPolyline(): void;
    cancelImageCrop(): void;
    searchCallback?: (() => void) | null;
    shortcutsCallback?: (() => void) | null;
    invalidateCache(): void;
    clearCanvas(): void;
    syncShapes(): void;
    notifySelection(): void;
    setSpacePressed(v: boolean): void;
}

/**
 * Keyboard shortcut handling.
 *
 * Maps key combinations to drawing actions: tool switching, viewport
 * navigation, shape manipulation, text formatting, and undo/redo.
 */
export class KeyboardManager {
    private keyDownHandler = (e: KeyboardEvent) => {
        if (this.context.textManager.hasTextEditOverlay) return;

        const target = e.target as HTMLElement | null;
        if (
            target?.tagName === "INPUT" ||
            target?.tagName === "TEXTAREA" ||
            target?.isContentEditable
        ) {
            return;
        }

        if (this.context.viewMode) {
            const isNav =
                e.code === "Space" ||
                ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Escape"].includes(e.key) ||
                ((e.ctrlKey || e.metaKey) && ["0", "=", "+", "-"].includes(e.key)) ||
                (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && ["1", "2"].includes(e.key)) ||
                (e.altKey && !e.ctrlKey && !e.metaKey && ["z", "r", "s"].includes(e.key.toLowerCase()));
            if (!isNav) return;
        }

        if (e.key === "Escape") {
            e.preventDefault();
            this.api.cancelPolyline?.();
            this.api.cancelImageCrop?.();
            if (this.context.selectedIds.size > 0) {
                this.context.selectedIds.clear();
                this.api.notifySelection?.();
                this.api.invalidateCache();
                this.api.clearCanvas();
            }
            return;
        }

        if (this.context.viewMode) {
            const isNav =
                e.code === "Space" ||
                ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Escape"].includes(e.key) ||
                ((e.ctrlKey || e.metaKey) && ["0", "=", "+", "-"].includes(e.key)) ||
                (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && ["1", "2"].includes(e.key)) ||
                (e.altKey && !e.ctrlKey && !e.metaKey && ["z", "r", "s"].includes(e.key.toLowerCase()));
            if (!isNav) return;
        }

        if (e.key === "Escape") {
            e.preventDefault();
            this.api.cancelPolyline?.();
            if (this.context.cropMode) {
                this.context.cropMode = false;
                this.context.cropRect = null;
                this.context.cropDragCorner = null;
                this.context.cropStartRect = null;
                this.api.clearCanvas();
            }
            if (this.context.selectedIds.size > 0) {
                this.context.selectedIds.clear();
                this.api.notifySelection?.();
                this.api.invalidateCache();
                this.api.clearCanvas();
            }
            return;
        }

        if (this.context.cropMode) {
            if (e.key === "Enter") {
                e.preventDefault();
                this.context.cropMode = false;
                this.context.cropDragCorner = null;
                this.context.cropStartRect = null;
                this.api.clearCanvas();
            }
            return;
        }

        if (e.code === "Space") {
            e.preventDefault();
            this.api.setSpacePressed(true);
            return;
        }

        const mod = e.ctrlKey || e.metaKey;
        const noMods = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;

        if (mod && e.altKey && !e.shiftKey && e.code === "KeyC") {
            e.preventDefault();
            this.context.shapeManager.copySelectedStyles();
            return;
        }
        if (mod && e.altKey && !e.shiftKey && e.code === "KeyV") {
            e.preventDefault();
            this.context.shapeManager.pasteSelectedStyles();
            return;
        }
        if (e.shiftKey && e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyC") {
            e.preventDefault();
            this.api.copySelectionAsPng();
            return;
        }
        if (mod && e.shiftKey && !e.altKey && e.key === "t") {
            e.preventDefault();
            this.context.shapeManager.alignTop();
            return;
        }
        if (mod && e.shiftKey && !e.altKey && e.key === "b") {
            e.preventDefault();
            this.context.shapeManager.alignBottom();
            return;
        }
        if (mod && !e.altKey && (e.key === "[" || e.key === "]")) {
            e.preventDefault();
            if (e.key === "[") {
                e.shiftKey ? this.context.shapeManager.sendToBack() : this.context.shapeManager.sendBackward();
            } else {
                e.shiftKey ? this.context.shapeManager.bringToFront() : this.context.shapeManager.bringForward();
            }
            return;
        }
        if (mod && !e.altKey && !e.shiftKey && e.key === "x") {
            e.preventDefault();
            this.cutSelectedShape();
            return;
        }
        if (mod && !e.altKey && !e.shiftKey && (e.key === "=" || e.key === "+")) {
            e.preventDefault();
            this.zoomIn();
            return;
        }
        if (mod && !e.altKey && !e.shiftKey && e.key === "-") {
            e.preventDefault();
            this.zoomOut();
            return;
        }
        if (mod && !e.altKey && !e.shiftKey && e.key === "'") {
            e.preventDefault();
            this.toggleSnapToGrid();
            return;
        }
        if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "2") {
            e.preventDefault();
            this.zoomToSelection();
            return;
        }
        if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.code === "KeyH") {
            e.preventDefault();
            this.context.shapeManager.flipSelectedShapes(true);
            return;
        }
        if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.code === "KeyV") {
            e.preventDefault();
            this.context.shapeManager.flipSelectedShapes(false);
            return;
        }
        if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyD") {
            e.preventDefault();
            this.toggleTheme();
            return;
        }
        if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyZ") {
            e.preventDefault();
            this.toggleZenMode();
            return;
        }
        if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyR") {
            e.preventDefault();
            this.toggleViewMode();
            return;
        }
        if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyS") {
            e.preventDefault();
            this.toggleSnapToObjects();
            return;
        }
        if (e.key === "Tab") {
            e.preventDefault();
            this.toggleShapeType(!e.shiftKey);
            return;
        }
        if (noMods && e.key === "q") {
            e.preventDefault();
            this.toggleStayAfterDraw();
            return;
        }
        if (noMods && e.key === "k") {
            e.preventDefault();
            this.api.setTool("laser");
            return;
        }
        if (noMods && e.key === "f") {
            e.preventDefault();
            this.api.setTool("frame");
            return;
        }
        if (noMods && e.key === "l") {
            e.preventDefault();
            this.api.setTool("line");
            return;
        }
        if (noMods && e.key === "Enter") {
            e.preventDefault();
            this.api.enterEditAction();
            return;
        }
        if (e.key === "PageUp") {
            e.preventDefault();
            this.context.viewport.panY += this.context.cssHeight * 0.8;
            this.api.invalidateCache();
            this.api.clearCanvas();
            return;
        }
        if (e.key === "PageDown") {
            e.preventDefault();
            this.context.viewport.panY -= this.context.cssHeight * 0.8;
            this.api.invalidateCache();
            this.api.clearCanvas();
            return;
        }
        const digitTools: Record<string, string> = {
            "1": "select",
            "2": "rect",
            "3": "diamond",
            "4": "circle",
            "5": "arrow",
            "6": "line",
            "7": "pen",
            "8": "text",
            "9": "image",
            "0": "eraser",
        };
        if (noMods && e.key in digitTools) {
            e.preventDefault();
            if (digitTools[e.key] === "image") {
                this.api.insertImage();
            } else {
                this.api.setTool(digitTools[e.key]);
            }
            return;
        }

        const pluginTool = this.context.pluginManager.getTool(this.api.selectedTool);
        if (pluginTool?.onKeyDown) {
            const ctx = this.context.pluginManager.getContext();
            if (ctx && pluginTool.onKeyDown(ctx, e)) {
                return;
            }
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "z") {
            e.preventDefault();
            if (e.shiftKey) {
                this.context.historyManager.redo();
            } else {
                this.context.historyManager.undo();
            }
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "c") {
            e.preventDefault();
            this.context.clipboardManager.copySelectedShape();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "v") {
            e.preventDefault();
            this.context.clipboardManager.pendingPaste = true;
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "d") {
            e.preventDefault();
            this.context.shapeManager.duplicateSelected();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "g") {
            e.preventDefault();
            if (e.shiftKey) {
                this.context.shapeManager.ungroup();
            } else {
                this.context.shapeManager.group();
            }
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "b") {
            e.preventDefault();
            this.context.textManager.textBold = !this.context.textManager.textBold;
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "i") {
            e.preventDefault();
            this.context.textManager.textItalic = !this.context.textManager.textItalic;
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "l") {
            e.preventDefault();
            this.context.shapeManager.alignLeft();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "r") {
            e.preventDefault();
            this.context.shapeManager.alignRight();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "c") {
            e.preventDefault();
            this.context.shapeManager.alignCenter();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "h") {
            e.preventDefault();
            this.context.shapeManager.distributeHorizontal();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "v") {
            e.preventDefault();
            this.context.shapeManager.distributeVertical();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "l") {
            e.preventDefault();
            if (this.context.selectedIds.size === 0) {
                this.toggleLock();
                return;
            }
            const allLocked = [...this.context.selectedIds].every(id => {
                const shape = this.context.existingShapes.find((s) => s.id === id) ?? this.context.trash.find((s) => s.id === id);
                return shape?.locked;
            });
            if (allLocked) {
                this.context.shapeManager.unlockShapes();
            } else {
                this.context.shapeManager.lockShapes();
            }
            return;
        }

        if (
            (e.code === "Delete" || e.code === "Backspace") &&
            this.context.selectedIds.size > 0
        ) {
            e.preventDefault();
            this.context.shapeManager.deleteSelectedShape();
            return;
        }

        if (e.key === "i" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.api.setTool("eyedropper");
            return;
        }

        if (e.key === "p" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.api.setTool("pen");
            return;
        }

        if (e.key === "v" && !e.ctrlKey && !e.metaKey && !e.altKey && !this.context._locked) {
            e.preventDefault();
            this.api.setTool("select");
            return;
        }

        if (e.key === "h" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.api.setHandPanning(!this.context._handMode);
            return;
        }

        if (e.key === "r" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.api.setTool("rect");
            return;
        }

        if (e.key === "o" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.api.setTool("circle");
            return;
        }

        if (e.key === "t" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.api.setTool("text");
            return;
        }

        if (e.key === "e" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.api.setTool("eraser");
            return;
        }

        if (e.key === "a" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.api.setTool("arrow");
            return;
        }

        if (e.key === "d" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.api.setTool("diamond");
            return;
        }

        if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.api.shortcutsCallback?.();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "f") {
            e.preventDefault();
            this.api.searchCallback?.();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "a") {
            e.preventDefault();
            this.selectAll();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "0") {
            e.preventDefault();
            this.resetZoom();
            return;
        }

        if (e.key === "=" || e.key === "+") {
            e.preventDefault();
            this.zoomIn();
            return;
        }

        if (e.key === "-") {
            e.preventDefault();
            this.zoomOut();
            return;
        }

        if (e.key === "b" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.cycleBackground();
            return;
        }

        if (e.key === "g" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.toggleSnapToGrid();
            return;
        }

        if (e.key === "1" && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.zoomToFit();
            return;
        }

        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault();
            const step = this.context.snapToGrid ? this.context.gridSize : (e.shiftKey ? 10 : 1);

            if (this.context.selectedIds.size > 0) {
                const selectedShapes = this.context.existingShapes
                    .filter((s) => s.id && this.context.selectedIds.has(s.id))
                    .map((s) => structuredClone(s));
                const prevMap = new Map(selectedShapes.map((s) => [s.id, s]));
                const prev = this.context.existingShapes.map((s) => prevMap.get(s.id) ?? s);
                const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
                const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
                for (const id of this.context.selectedIds) {
                    const shape = this.context.existingShapes.find((s) => s.id === id) ?? this.context.trash.find((s) => s.id === id);
                    if (!shape || shape.locked) continue;
                    moveShape(shape, dx, dy);
                }
                for (const id of this.context.selectedIds) {
                    this.context.arrowManager.updateBoundArrows(id);
                }
                for (const id of this.context.selectedIds) {
                    this.context.textManager.updateBoundText(id);
                }
                this.context.undoManager.push(prev, this.context.existingShapes);
                this.api.syncShapes();
            } else {
                const panStep = e.shiftKey ? 100 : 20;
                if (e.key === "ArrowLeft") this.context.viewport.panX += panStep;
                if (e.key === "ArrowRight") this.context.viewport.panX -= panStep;
                if (e.key === "ArrowUp") this.context.viewport.panY += panStep;
                if (e.key === "ArrowDown") this.context.viewport.panY -= panStep;
                this.api.invalidateCache();
                this.api.clearCanvas();
            }
            return;
        }
    };

    private keyUpHandler = (e: KeyboardEvent) => {
        if (e.code === "Space" && !this.context._handMode) {
            this.api.setSpacePressed(false);
        }
    };

    constructor(
        private context: GameContext,
        private api: KeyboardManagerApi,
    ) {}

    init() {
        window.addEventListener("keydown", this.keyDownHandler);
        window.addEventListener("keyup", this.keyUpHandler);
    }

    destroy() {
        window.removeEventListener("keydown", this.keyDownHandler);
        window.removeEventListener("keyup", this.keyUpHandler);
    }

    private toggleShapeType(forward: boolean) {
        if (this.api.selectedTool === "arrow") {
            this.api.setTool("line");
            return;
        }
        if (this.api.selectedTool === "line") {
            this.api.setTool("arrow");
            return;
        }
        const cycle = ["rect", "diamond", "circle"];
        const idx = cycle.indexOf(this.api.selectedTool as string);
        if (idx === -1) {
            this.api.setTool("rect");
            return;
        }
        this.api.setTool(cycle[(idx + (forward ? 1 : cycle.length - 1)) % cycle.length]);
    }

    private toggleStayAfterDraw() {
        this.context.stayAfterDraw = !this.context.stayAfterDraw;
    }

    private toggleTheme() {
        this.context.styleManager.setTheme(!this.context.isDark);
    }

    private zoomIn() {
        this.context.viewport.zoomIn(this.context.cssWidth, this.context.cssHeight);
        this.api.invalidateCache();
        this.api.clearCanvas();
    }

    private zoomOut() {
        this.context.viewport.zoomOut(this.context.cssWidth, this.context.cssHeight);
        this.api.invalidateCache();
        this.api.clearCanvas();
    }

    private zoomToSelection() {
        if (this.context.selectedIds.size === 0) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const id of this.context.selectedIds) {
            const shape = this.context.existingShapes.find((s) => s.id === id) ?? this.context.trash.find((s) => s.id === id);
            if (!shape) continue;
            const b = getShapeBounds(shape);
            if (!b) continue;
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.w);
            maxY = Math.max(maxY, b.y + b.h);
        }
        if (minX === Infinity) return;
        this.context.viewport.zoomToFit(
            { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
            this.context.cssWidth,
            this.context.cssHeight,
        );
        this.api.invalidateCache();
        this.api.clearCanvas();
    }

    private zoomToFit() {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasShapes = false;
        for (const shape of this.context.existingShapes) {
            if (shape.type === "eraser") continue;
            const b = getShapeBounds(shape);
            if (!b) continue;
            hasShapes = true;
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.w);
            maxY = Math.max(maxY, b.y + b.h);
        }
        if (!hasShapes) return;
        this.context.viewport.zoomToFit(
            { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
            this.context.cssWidth,
            this.context.cssHeight,
        );
        this.api.invalidateCache();
        this.api.clearCanvas();
    }

    private resetZoom() {
        this.context.viewport.zoom = 1;
        this.context.viewport.panX = 0;
        this.context.viewport.panY = 0;
        this.api.invalidateCache();
        this.api.clearCanvas();
    }

    private selectAll() {
        this.context.selectedIds = new Set(this.context.existingShapes.map(s => s.id).filter((id): id is string => id !== undefined));
        this.api.notifySelection?.();
        this.api.invalidateCache();
        this.api.clearCanvas();
    }

    private toggleSnapToGrid() {
        this.context.snapToGrid = !this.context.snapToGrid;
    }

    private toggleSnapToObjects() {
        this.context.snapToObjects = !this.context.snapToObjects;
    }

    private toggleZenMode() {
        this.context.zenMode = !this.context.zenMode;
        this.api.clearCanvas();
    }

    private toggleViewMode() {
        this.context.viewMode = !this.context.viewMode;
        if (this.context.viewMode) {
            this.context.selectedIds.clear();
            this.api.notifySelection?.();
        }
        this.api.clearCanvas();
    }

    private setTheme(isDark: boolean) {
        this.context.styleManager.setTheme(isDark);
    }

    private cycleBackground() {
        this.context.styleManager.cycleBackground();
    }

    private cutSelectedShape() {
        this.context.clipboardManager.copySelectedShape();
        this.context.shapeManager.deleteSelectedShape();
    }

    private toggleLock() {
        this.context._locked = !this.context._locked;
        if (this.context._locked) {
            this.context.selectedIds.clear();
            this.api.notifySelection?.();
            this.api.clearCanvas();
        }
    }
}
