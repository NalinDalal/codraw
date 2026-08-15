import { getShapeBounds, getShapeCenter, Shape, Point, Bounds } from "@repo/shapes";
import { moveShape } from "../inputHandler";
import rough from "roughjs";
import { hitTest, eraserIntersectsShape, drawDragSelect } from "../renderer";
import type { GameContext } from "../gameContext";
import type { ArrowManager } from "./arrowManager";
import type { ImageManager } from "./imageManager";
import type { PluginManager } from "./pluginManager";
import type { ShapeManager } from "./shapeManager";
import type { TextManager } from "./textManager";

/** Capabilities the PointerInteractionManager needs from the owning Game instance. */
export interface PointerInteractionApi {
    ctx: CanvasRenderingContext2D;
    rc: ReturnType<typeof rough.canvas>;
    setTool(tool: string): void;
    setHandPanning(active: boolean): void;
    startTextEdit(x: number, y: number, text: string | undefined, index: number | undefined, style: any): void;
    copySelectionAsPng(): void;
    setLaserPosition(x: number, y: number): void;
    toggleTheme(): void;
    cycleBackground(): void;
    toggleSnapToGrid(): void;
    toggleLock(): void;
    selectAll(): void;
    zoomIn(): void;
    zoomOut(): void;
    zoomToFit(): void;
    zoomToSelection(): void;
    resetZoom(): void;
    insertImage(): void;
    openImagePicker(coords: [number, number]): void;
    notifySelection(): void;
    syncShapes(): void;
    invalidateCache(): void;
    clearCanvas(): void;
    pushUndo(prev: Shape[], current: Shape[]): void;
    broadcastCursor(x: number, y: number): void;
    get styleChangeCallback(): (() => void) | null;
    get toolChangeCallback(): ((tool: string) => void) | null;
}

/**
 * Pointer interaction handling for all tool modes.
 *
 * Owns the drag/resize/rotate/polyline/pen/eraser interaction state and
 * the `handlePointerDown/Up/Move` dispatch methods. `Game` keeps only
 * thin event-binding wrappers that delegate here.
 */
export class PointerInteractionManager {
    // Pointer interaction state
    isDragging = false;
    isSelecting = false;
    isResizing = false;
    isRotating = false;
    dragOffsetX = 0;
    dragOffsetY = 0;
    dragStartShapes: Shape[] | null = null;
    dragStartPoint: { x: number; y: number } | null = null;
    lastSnappedDelta: { x: number; y: number } | null = null;
    dragStartBounds: Bounds | null = null;
    resizeHandle = -1;
    resizeStartBounds: { x: number; y: number; w: number; h: number } | null = null;
    resizeShiftKey = false;
    rotateStartAngle = 0;
    rotateStartRotation = 0;
    startX = 0;
    startY = 0;
    clicked = false;
    lastPointerX = 0;
    lastPointerY = 0;
    escapePressed = false;
    isPanning = false;
    panStartX = 0;
    panStartY = 0;
    spacePressed = false;
    polylinePoints: Array<[number, number]> = [];
    isDrawingPolyline = false;
    polylineStartCount = 0;
    constantPenPoints: Point[] = [];
    eraserPoints: Point[] = [];
    eraserRadius = 20;

    constructor(
        private context: GameContext,
        private api: PointerInteractionApi,
    ) {}

    /** Handle pointer down for all tool modes. */
    handlePointerDown(clientX: number, clientY: number, shiftKey: boolean, e: MouseEvent) {
        if (this.context.viewMode) return;
        this.escapePressed = false;
        this.isSelecting = false;
        this.isResizing = false;
        this.isRotating = false;
        this.clicked = true;
        this.lastPointerX = clientX;
        this.lastPointerY = clientY;
        const coords = this.context.viewport.getCanvasCoords(clientX, clientY);
        const isShapeTool =
            this.context.selectedTool === "rect" ||
            this.context.selectedTool === "circle" ||
            this.context.selectedTool === "diamond" ||
            this.context.selectedTool === "ellipsisArc" ||
            this.context.selectedTool === "arrow" ||
            this.context.selectedTool === "line" ||
            this.context.selectedTool === "stickyNote" ||
            this.context.selectedTool === "frame" ||
            this.context.selectedTool === "text";
        this.startX = isShapeTool ? this.snap(coords[0]) : coords[0];
        this.startY = isShapeTool ? this.snap(coords[1]) : coords[1];

        if (this.context.cropMode && this.context.cropRect) {
            const handleSize = 8 / this.context.viewport.zoom;
            const corners = [
                { x: this.context.cropRect.x, y: this.context.cropRect.y },
                { x: this.context.cropRect.x + this.context.cropRect.w, y: this.context.cropRect.y },
                { x: this.context.cropRect.x + this.context.cropRect.w, y: this.context.cropRect.y + this.context.cropRect.h },
                { x: this.context.cropRect.x, y: this.context.cropRect.y + this.context.cropRect.h },
            ];
            for (let i = 0; i < corners.length; i++) {
                const dx = coords[0] - corners[i].x;
                const dy = coords[1] - corners[i].y;
                if (dx * dx + dy * dy <= handleSize * handleSize) {
                    this.context.cropDragCorner = i;
                    this.context.cropStartRect = { ...this.context.cropRect };
                    return;
                }
            }
            return;
        }

        const pluginTool = this.context.pluginManager.getTool(this.context.selectedTool);
        if (pluginTool?.onMouseDown) {
            const ctx = this.context.pluginManager.getContext();
            if (ctx) {
                pluginTool.onMouseDown(ctx, coords[0], coords[1], e);
                return;
            }
        }

        if (this.context.selectedTool === "select") {
            const lockedIds = new Set(this.context.existingShapes.filter(s => s.locked).map(s => s.id!));
            const hit = hitTest(coords, this.context.existingShapes, this.context.viewport.zoom, lockedIds);

            if (this.context.selectedIds.size === 1) {
                const handleIdx = this.hitTestResizeHandle(coords);
                if (handleIdx === -2) {
                    const id = [...this.context.selectedIds][0];
                    const shape = this.shapeById(id);
                    if (shape) {
                        const bounds = getShapeBounds(shape);
                        if (bounds) {
                            const cx = bounds.x + bounds.w / 2;
                            const cy = bounds.y + bounds.h / 2;
                            this.isRotating = true;
                            this.rotateStartAngle = Math.atan2(coords[1] - cy, coords[0] - cx);
                            this.rotateStartRotation = shape.rotation ?? 0;
                            this.dragStartShapes = structuredClone(this.context.existingShapes);
                            return;
                        }
                    }
                } else if (handleIdx !== -1) {
                    const id = [...this.context.selectedIds][0];
                    const shape = this.shapeById(id);
                    if (shape) {
                        this.isResizing = true;
                        this.resizeHandle = handleIdx;
                        this.resizeShiftKey = shiftKey;
                        this.resizeStartBounds = getShapeBounds(shape)!;
                        this.dragStartShapes = structuredClone(this.context.existingShapes);
                        return;
                    }
                }
            }

            if (hit !== null) {
                const hitShape = this.context.existingShapes[hit];

                if (shiftKey) {
                    if (this.context.selectedIds.has(hitShape.id!)) {
                        this.context.selectedIds.delete(hitShape.id!);
                    } else {
                        this.context.selectedIds.add(hitShape.id!);
                    }
                    this.api.notifySelection();
                    this.api.clearCanvas();
                    return;
                }

                if (hitShape.groupId && !(e.metaKey || e.ctrlKey)) {
                    this.context.selectedIds = new Set();
                    for (const s of this.context.existingShapes) {
                        if (s.groupId === hitShape.groupId && s.id) {
                            this.context.selectedIds.add(s.id);
                        }
                    }
                } else {
                    this.context.selectedIds = new Set([hitShape.id!]);
                }
                this.api.notifySelection();
                this.isDragging = true;
                this.dragOffsetX = coords[0];
                this.dragOffsetY = coords[1];
                this.dragStartShapes = structuredClone(this.context.existingShapes);
                this.dragStartPoint = { x: coords[0], y: coords[1] };
                this.lastSnappedDelta = { x: 0, y: 0 };
                this.dragStartBounds = this.selectionBounds(this.dragStartShapes);
            } else {
                this.context.selectedIds.clear();
                this.api.notifySelection();
                this.isSelecting = true;
                this.dragOffsetX = 0;
                this.dragOffsetY = 0;
            }
            return;
        }

        if (this.context.selectedTool === "text") {
            const hit = hitTest(coords, this.context.existingShapes, this.context.viewport.zoom);
            if (hit !== null) {
                const shape = this.context.existingShapes[hit];
                if (shape.type === "text") {
                    this.api.startTextEdit(shape.x, shape.y, shape.text, hit, {
                        bold: shape.bold,
                        italic: shape.italic,
                        fontFamily: shape.fontFamily,
                        fontSize: shape.fontSize,
                        textAlign: shape.textAlign || "left",
                    });
                    return;
                }
            }
            this.api.startTextEdit(this.startX, this.startY, undefined, undefined, {
                bold: this.context.textManager.textBold,
                italic: this.context.textManager.textItalic,
                fontFamily: this.context.textManager.textFontFamily,
                fontSize: this.context.textManager.textFontSize,
                textAlign: this.context.textManager.textAlign,
            });
            return;
        }

        if (this.context.selectedTool === "image") {
            this.api.openImagePicker(coords);
            this.clicked = false;
            return;
        }

        if (this.context.selectedTool === "eyedropper") {
            const hit = hitTest(coords, this.context.existingShapes, this.context.viewport.zoom);
            if (hit !== null) {
                const shape = this.context.existingShapes[hit];
                if (shape.style?.strokeColor) {
                    this.context.currentStyle = { ...this.context.currentStyle, strokeColor: shape.style.strokeColor };
                    this.context._styleCustomized = true;
                    this.api.styleChangeCallback?.();
                }
            }
            this.api.setTool("select");
            this.clicked = false;
            return;
        }

        if (this.context.selectedTool === "pen") {
            this.constantPenPoints = [[coords[0], coords[1]]];
        }

        if (this.context.selectedTool === "eraser") {
            this.eraserPoints = [[coords[0], coords[1]]];
        }

        if (this.context.selectedTool === "line") {
            if (!this.isDrawingPolyline) {
                this.polylinePoints = [[this.startX, this.startY]];
                this.isDrawingPolyline = true;
            } else {
                this.polylinePoints.push([this.startX, this.startY]);
            }
            this.polylineStartCount = this.polylinePoints.length;
            return;
        }
    }

    /** Handle pointer up — commit shapes, finalize drag, or complete eraser stroke */
    handlePointerUp(e: MouseEvent) {
        if (this.escapePressed) {
            this.escapePressed = false;
            this.isSelecting = false;
            this.isResizing = false;
            this.isRotating = false;
            this.isDragging = false;
            this.context.alignmentGuides = [];
            this.api.clearCanvas();
            return;
        }
        if (this.context.cropMode && this.context.cropDragCorner !== null) {
            this.context.cropDragCorner = null;
            this.context.cropStartRect = null;
            this.api.clearCanvas();
            return;
        }

        if (this.isResizing) {
            this.isResizing = false;
            this.resizeHandle = -1;
            this.resizeStartBounds = null;
            if (this.dragStartShapes) {
                this.api.pushUndo(this.dragStartShapes, this.context.existingShapes);
                this.dragStartShapes = null;
            }
            this.api.syncShapes();
            return;
        }

        if (this.isRotating) {
            this.isRotating = false;
            if (this.dragStartShapes) {
                this.api.pushUndo(this.dragStartShapes, this.context.existingShapes);
                this.dragStartShapes = null;
            }
            this.api.syncShapes();
            return;
        }

        if (this.context.selectedTool === "select") {
            if (this.isSelecting) {
                this.isSelecting = false;
                const endX = this.startX + this.dragOffsetX;
                const endY = this.startY + this.dragOffsetY;
                const selX = Math.min(this.startX, endX);
                const selY = Math.min(this.startY, endY);
                const selW = Math.abs(endX - this.startX);
                const selH = Math.abs(endY - this.startY);
                for (let i = 0; i < this.context.existingShapes.length; i++) {
                    const shape = this.context.existingShapes[i];
                    const bounds = getShapeBounds(shape);
                    if (bounds) {
                        const overlap =
                            bounds.x < selX + selW &&
                            bounds.x + bounds.w > selX &&
                            bounds.y < selY + selH &&
                            bounds.y + bounds.h > selY;
                        if (overlap && shape.id) this.context.selectedIds.add(shape.id);
                    }
                }
                this.api.notifySelection();
                this.api.clearCanvas();
            } else if (this.context.selectedIds.size > 0) {
                if (this.dragStartShapes) {
                    this.api.pushUndo(this.dragStartShapes, this.context.existingShapes);
                    this.dragStartShapes = null;
                }
                this.context.alignmentGuides = [];
                this.api.syncShapes();
            }
            return;
        }

        if (this.context.selectedTool === "pen") {
            if (this.constantPenPoints.length < 2) return;
            this.context.shapeManager.commitShape({
                type: "pencil",
                points: [...this.constantPenPoints],
                constantWidth: true,
            });
            this.constantPenPoints = [];
            return;
        }

        if (this.context.selectedTool === "eraser") {
            if (this.eraserPoints.length === 0) return;

            const prev = [...this.context.existingShapes];
            this.context.existingShapes = this.context.existingShapes.filter(
                (shape) => !eraserIntersectsShape(this.eraserPoints, shape, this.eraserRadius),
            );
            this.api.pushUndo(prev, this.context.existingShapes);
            this.context.selectedIds.clear();
            this.api.notifySelection();
            this.eraserPoints = [];
            this.api.syncShapes();
            return;
        }

        const rawCoords = this.context.viewport.getCanvasCoords(this.lastPointerX, this.lastPointerY);
        const isShapeTool =
            this.context.selectedTool === "rect" ||
            this.context.selectedTool === "circle" ||
            this.context.selectedTool === "diamond" ||
            this.context.selectedTool === "ellipsisArc" ||
            this.context.selectedTool === "arrow" ||
            this.context.selectedTool === "line" ||
            this.context.selectedTool === "stickyNote" ||
            this.context.selectedTool === "frame";
        const coords: [number, number] = isShapeTool
            ? [this.snap(rawCoords[0]), this.snap(rawCoords[1])]
            : [rawCoords[0], rawCoords[1]];
        const width = coords[0] - this.startX;
        const height = coords[1] - this.startY;

        let shape: Shape | null = null;
        if (this.context.selectedTool === "rect") {
            shape = { type: "rect", x: this.startX, y: this.startY, height, width };
        } else if (this.context.selectedTool === "circle") {
            const radius = Math.max(width, height) / 2;
            shape = { type: "circle", radius, centerX: this.startX + radius, centerY: this.startY + radius };
        } else if (this.context.selectedTool === "diamond") {
            shape = {
                type: "diamond",
                centerX: this.startX + width / 2,
                centerY: this.startY + height / 2,
                width: Math.abs(width),
                height: Math.abs(height),
            };
        } else if (this.context.selectedTool === "ellipsisArc") {
            shape = {
                type: "ellipsisArc",
                centerX: this.startX + width / 2,
                centerY: this.startY + height / 2,
                width: Math.abs(width),
                height: Math.abs(height),
                startAngle: 0,
                endAngle: Math.PI,
            };
        } else if (this.context.selectedTool === "arrow") {
            const startBind = this.context.arrowManager.findNearestBinding([this.startX, this.startY]);
            const endBind = this.context.arrowManager.findNearestBinding([coords[0], coords[1]], startBind?.id);
            shape = {
                type: "arrow",
                startX: startBind?.x ?? this.startX,
                startY: startBind?.y ?? this.startY,
                endX: endBind?.x ?? coords[0],
                endY: endBind?.y ?? coords[1],
                arrowHeadSize: 10,
                startBinding: startBind?.id,
                endBinding: endBind?.id,
            };
        } else if (this.context.selectedTool === "line") {
            if (this.isDrawingPolyline) {
                const last = this.polylinePoints[this.polylinePoints.length - 1];
                const moved = Math.hypot(coords[0] - last[0], coords[1] - last[1]) > 3;
                if (moved) {
                    this.polylinePoints.push([coords[0], coords[1]]);
                    if (this.polylineStartCount === 1) {
                        this.finishPolyline();
                    }
                }
            }
        } else if (this.context.selectedTool === "stickyNote") {
            const noteColors = ["#fff9b1", "#ff8a80", "#82b1ff", "#b9f6ca", "#ea80fc"];
            const noteColor = noteColors[Math.floor(Math.random() * noteColors.length)];
            shape = {
                type: "stickyNote",
                x: this.startX,
                y: this.startY,
                width: Math.abs(width) || 150,
                height: Math.abs(height) || 150,
                noteColor,
                text: "",
            };
        } else if (this.context.selectedTool === "frame") {
            const frameCount = this.context.existingShapes.filter(s => s.type === "frame").length;
            shape = {
                type: "frame",
                x: this.startX,
                y: this.startY,
                width: Math.abs(width) || 300,
                height: Math.abs(height) || 200,
                name: `Frame ${frameCount + 1}`,
            };
        }

        if (!shape) return;
        this.context.shapeManager.commitShape(shape, true);
    }

    /** Handle pointer move for all tool modes. */
    handlePointerMove(clientX: number, clientY: number, e: MouseEvent) {
        if (this.context.viewMode) return;
        this.lastPointerX = clientX;
        this.lastPointerY = clientY;
        const coords = this.context.viewport.getCanvasCoords(clientX, clientY);

        if (this.context.selectedTool === "line" && this.isDrawingPolyline && this.polylinePoints.length > 0) {
            this.api.clearCanvas();
            this.api.ctx.save();
            this.api.ctx.translate(this.context.viewport.panX, this.context.viewport.panY);
            this.api.ctx.scale(this.context.viewport.zoom, this.context.viewport.zoom);
            const pts = this.polylinePoints;
            this.api.ctx.beginPath();
            this.api.ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) {
                this.api.ctx.lineTo(pts[i][0], pts[i][1]);
            }
            this.api.ctx.lineTo(this.snap(coords[0]), this.snap(coords[1]));
            this.api.ctx.strokeStyle = this.context.currentStyle.strokeColor;
            this.api.ctx.lineWidth = this.context.currentStyle.strokeWidth;
            this.api.ctx.globalAlpha = this.context.currentStyle.opacity;
            this.api.ctx.stroke();
            this.api.ctx.restore();
        }

        if (!this.clicked) return;

        if (this.context.cropMode && this.context.cropRect && this.context.cropDragCorner !== null && this.context.cropStartRect) {
            const s = this.context.cropStartRect;
            const opp = [
                { x: s.x + s.w, y: s.y + s.h },
                { x: s.x, y: s.y + s.h },
                { x: s.x, y: s.y },
                { x: s.x + s.w, y: s.y },
            ];
            const o = opp[this.context.cropDragCorner];
            const minX = Math.min(s.x, s.x + s.w);
            const maxX = Math.max(s.x, s.x + s.w);
            const minY = Math.min(s.y, s.y + s.h);
            const maxY = Math.max(s.y, s.y + s.h);
            const nx = Math.max(minX, Math.min(coords[0], maxX));
            const ny = Math.max(minY, Math.min(coords[1], maxY));
            const x = Math.min(nx, o.x);
            const y = Math.min(ny, o.y);
            const w = Math.abs(nx - o.x);
            const h = Math.abs(ny - o.y);
            this.context.cropRect = { x, y, w, h };
            this.api.clearCanvas();
            return;
        }

        const pluginToolMove = this.context.pluginManager.getTool(this.context.selectedTool);
        if (pluginToolMove?.onMouseMove) {
            const ctx = this.context.pluginManager.getContext();
            if (ctx) {
                pluginToolMove.onMouseMove(ctx, coords[0], coords[1], e as any);
                return;
            }
        }

        if (this.context.selectedTool === "select" && this.isSelecting) {
            this.dragOffsetX = coords[0] - this.startX;
            this.dragOffsetY = coords[1] - this.startY;
            this.api.clearCanvas();
            this.api.ctx.save();
            this.api.ctx.translate(this.context.viewport.panX, this.context.viewport.panY);
            this.api.ctx.scale(this.context.viewport.zoom, this.context.viewport.zoom);
            // drawDragSelect is imported from renderer
            drawDragSelect(this.api.ctx, this.startX, this.startY, coords[0], coords[1], this.context.viewport);
            this.api.ctx.restore();
            return;
        }

        if (this.context.selectedTool === "select" && this.isResizing && this.resizeStartBounds) {
            const rawW = coords[0] - this.startX;
            const rawH = coords[1] - this.startY;
            const b = this.resizeStartBounds;
            let newX = b.x, newY = b.y, newW = b.w, newH = b.h;
            const handle = this.resizeHandle;
            const shift = this.resizeShiftKey;
            if (shift) {
                const aspect = b.w / b.h;
                if (handle === 0 || handle === 2) {
                    newH = rawH;
                    newW = newH * aspect;
                    newY = b.y + rawH;
                } else if (handle === 1 || handle === 3) {
                    newW = rawW;
                    newH = newW / aspect;
                    newX = b.x + rawW;
                } else {
                    newW = rawW;
                    newH = rawH;
                }
            } else {
                if (handle === 0) { newX = b.x + rawW; newW = b.w - rawW; newY = b.y + rawH; newH = b.h - rawH; }
                else if (handle === 1) { newY = b.y + rawH; newH = b.h - rawH; newW = rawW; }
                else if (handle === 2) { newW = rawW; newH = rawH; }
                else if (handle === 3) { newX = b.x + rawW; newW = b.w - rawW; newH = rawH; }
                else if (handle === 4) { newH = rawH; }
                else if (handle === 5) { newW = rawW; }
                else if (handle === 6) { newX = b.x + rawW; newW = b.w - rawW; }
                else if (handle === 7) { newY = b.y + rawH; newH = b.h - rawH; }
            }
            if (newW < 5) { newW = 5; if (handle === 0 || handle === 3 || handle === 6) newX = b.x + b.w - 5; }
            if (newH < 5) { newH = 5; if (handle === 0 || handle === 1 || handle === 6) newY = b.y + b.h - 5; }
            const id = [...this.context.selectedIds][0];
            const shape = this.shapeById(id);
            if (!shape) return;
            (shape as any).x = newX;
            (shape as any).y = newY;
            (shape as any).width = newW;
            (shape as any).height = newH;
            if (shape.type === "arrow" || shape.type === "line") {
                const sx = newW > 0 ? newW / b.w : 1;
                const sy = newH > 0 ? newH / b.h : 1;
                (shape as any).startX = newX + (b.x !== 0 ? ((shape as any).startX - b.x) * sx : 0);
                (shape as any).startY = newY + (b.y !== 0 ? ((shape as any).startY - b.y) * sy : 0);
                (shape as any).endX = newX + (b.x !== 0 ? ((shape as any).endX - b.x) * sx : 0);
                (shape as any).endY = newY + (b.y !== 0 ? ((shape as any).endY - b.y) * sy : 0);
                if (shape.type === "line" && (shape as any).points) {
                    (shape as any).points = (shape as any).points.map(([px, py]: [number, number]) => [
                        newX + (b.x !== 0 ? (px - b.x) * sx : 0),
                        newY + (b.y !== 0 ? (py - b.y) * sy : 0),
                    ]);
                }
            }
            this.context.textManager.updateBoundText(id);
            this.context.arrowManager.updateBoundArrows(id);
            this.api.invalidateCache();
            this.api.clearCanvas();
            return;
        }

        if (this.context.selectedTool === "select" && this.isRotating) {
            const id = [...this.context.selectedIds][0];
            const shape = this.shapeById(id);
            if (!shape) return;
            const [cx, cy] = getShapeCenter(shape);
            const currentAngle = Math.atan2(coords[1] - cy, coords[0] - cx);
            const deltaAngle = currentAngle - this.rotateStartAngle;
            shape.rotation = this.rotateStartRotation + deltaAngle;
            this.api.invalidateCache();
            this.api.clearCanvas();
            return;
        }

        if (this.context.selectedTool === "select" && this.isDragging) {
            const rawX = coords[0] - this.dragStartPoint!.x;
            const rawY = coords[1] - this.dragStartPoint!.y;
            const snapped = this.snapDragDelta(rawX, rawY);
            const dx = snapped.x - this.lastSnappedDelta!.x;
            const dy = snapped.y - this.lastSnappedDelta!.y;
            this.lastSnappedDelta = snapped;

            for (const id of this.context.selectedIds) {
                const shape = this.shapeById(id);
                if (!shape || shape.locked) continue;
                moveShape(shape, dx, dy);
            }

            for (const id of this.context.selectedIds) {
                this.context.arrowManager.updateBoundArrows(id);
            }
            for (const id of this.context.selectedIds) {
                this.context.textManager.updateBoundText(id);
            }

            this.dragOffsetX = coords[0];
            this.dragOffsetY = coords[1];

            this.context.alignmentGuides = [];
            const tolerance = 5;
            for (const id of this.context.selectedIds) {
                const shape = this.shapeById(id);
                if (!shape) continue;
                const bounds = getShapeBounds(shape);
                if (!bounds) continue;
                const cx = bounds.x + bounds.w / 2;
                const cy = bounds.y + bounds.h / 2;
                for (const other of this.context.existingShapes) {
                    if (other.id && this.context.selectedIds.has(other.id)) continue;
                    const otherBounds = getShapeBounds(other);
                    if (!otherBounds) continue;
                    const otherCx = otherBounds.x + otherBounds.w / 2;
                    const otherCy = otherBounds.y + otherBounds.h / 2;
                    if (Math.abs(cx - otherCx) < tolerance) {
                        this.context.alignmentGuides.push({ x: otherCx });
                    }
                    if (Math.abs(bounds.x - otherBounds.x) < tolerance) {
                        this.context.alignmentGuides.push({ x: otherBounds.x });
                    }
                    if (Math.abs(bounds.x + bounds.w - otherBounds.x - otherBounds.w) < tolerance) {
                        this.context.alignmentGuides.push({ x: otherBounds.x + otherBounds.w });
                    }
                    if (Math.abs(cy - otherCy) < tolerance) {
                        this.context.alignmentGuides.push({ y: otherCy });
                    }
                    if (Math.abs(bounds.y - otherBounds.y) < tolerance) {
                        this.context.alignmentGuides.push({ y: otherBounds.y });
                    }
                    if (Math.abs(bounds.y + bounds.h - otherBounds.y - otherBounds.h) < tolerance) {
                        this.context.alignmentGuides.push({ y: otherBounds.y + otherBounds.h });
                    }
                }
            }

            this.api.invalidateCache();
            this.api.clearCanvas();
            return;
        }

        if (this.context.selectedTool === "pen") {
            this.constantPenPoints.push([coords[0], coords[1]]);
            return;
        }

        if (this.context.selectedTool === "eraser") {
            const last = this.eraserPoints[this.eraserPoints.length - 1];
            const dx = coords[0] - last[0];
            const dy = coords[1] - last[1];
            if (dx * dx + dy * dy > 25) {
                this.eraserPoints.push([coords[0], coords[1]]);
            }
            return;
        }
    }

    // ---- Polyline ----

    /**
     * Finish the in-progress polyline: dedupe nearby points and commit it
     * as a line shape. No-op when fewer than 2 distinct points exist.
     */
    finishPolyline() {
        if (this.polylinePoints.length < 2) {
            this.polylinePoints = [];
            this.isDrawingPolyline = false;
            return;
        }
        const points: Array<[number, number]> = [];
        for (const p of this.polylinePoints) {
            const last = points[points.length - 1];
            if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 3) {
                points.push(p);
            }
        }
        if (points.length < 2) {
            this.polylinePoints = [];
            this.isDrawingPolyline = false;
            return;
        }
        const first = points[0];
        const last = points[points.length - 1];
        this.context.shapeManager.commitShape({
            type: "line",
            startX: first[0],
            startY: first[1],
            endX: last[0],
            endY: last[1],
            points,
        }, true);
        this.polylinePoints = [];
        this.isDrawingPolyline = false;
    }

    /** Cancel the in-progress polyline and clear the preview. */
    cancelPolyline() {
        this.polylinePoints = [];
        this.isDrawingPolyline = false;
        this.api.clearCanvas();
    }

    // ---- Helpers moved from Game ----

    private shapeById(id: string): Shape | undefined {
        return this.context.existingShapes.find((s) => s.id === id) ?? this.context.trash.find((s) => s.id === id);
    }

    private selectionBounds(shapes: Shape[]): Bounds | null {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const s of shapes) {
            const b = getShapeBounds(s);
            if (b) {
                if (b.x < minX) minX = b.x;
                if (b.y < minY) minY = b.y;
                if (b.x + b.w > maxX) maxX = b.x + b.w;
                if (b.y + b.h > maxY) maxY = b.y + b.h;
            }
        }
        if (minX === Infinity) return null;
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    private snap(value: number): number {
        if (this.context.snapToGrid) {
            return Math.round(value / this.context.gridSize) * this.context.gridSize;
        }
        return value;
    }

    private snapDragDelta(rawDx: number, rawDy: number): { x: number; y: number } {
        if (!this.context.snapToGrid) return { x: rawDx, y: rawDy };
        const g = this.context.gridSize;
        const snap = (v: number) => Math.round(v / g) * g;
        const snappedX = snap(rawDx);
        const snappedY = snap(rawDy);
        const dx = snappedX - (this.lastSnappedDelta?.x ?? 0);
        const dy = snappedY - (this.lastSnappedDelta?.y ?? 0);
        return { x: snappedX, y: snappedY };
    }

    private hitTestResizeHandle(coords: [number, number]): number {
        const id = [...this.context.selectedIds][0];
        const shape = this.shapeById(id);
        if (!shape) return -1;
        const b = getShapeBounds(shape);
        if (!b) return -1;
        const handles = [
            { x: b.x, y: b.y },
            { x: b.x + b.w, y: b.y },
            { x: b.x + b.w, y: b.y + b.h },
            { x: b.x, y: b.y + b.h },
            { x: b.x + b.w / 2, y: b.y },
            { x: b.x + b.w, y: b.y + b.h / 2 },
            { x: b.x + b.w / 2, y: b.y + b.h },
            { x: b.x, y: b.y + b.h / 2 },
        ];
        const handleSize = 8 / this.context.viewport.zoom;
        for (let i = 0; i < handles.length; i++) {
            const dx = coords[0] - handles[i].x;
            const dy = coords[1] - handles[i].y;
            if (dx * dx + dy * dy <= handleSize * handleSize) return i;
        }
        const [cx, cy] = getShapeCenter(shape);
        const dist = Math.hypot(coords[0] - cx, coords[1] - cy);
        const rotationHandleDist = 30 / this.context.viewport.zoom;
        if (dist <= rotationHandleDist) return -2;
        return -1;
    }
}
