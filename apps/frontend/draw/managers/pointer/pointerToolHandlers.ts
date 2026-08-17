/**
 * Tool-specific pointer-down handlers for the canvas.
 *
 * Each handler receives the current pointer state and the canvas
 * coordinates for the down event, and mutates that state to advance
 * the interaction. The dispatcher in `PointerInteractionManager` calls
 * the appropriate handler after converting client coordinates.
 */

import {
    getShapeBounds,
    getShapeCenter,
    Shape,
    Point,
    Bounds,
    resolveStrokeColor,
} from "@repo/shapes";
import { hitTest, eraserIntersectsShape, drawDragSelect } from "../../renderer";
import { STICKY_NOTES } from "../../colorSystem";
import type { GameContext } from "../../gameContext";
import type { PointerInteractionApi } from "../pointerInteractionManager";
import { createDrawingState, finishPolyline, cancelPolyline } from "./polylineState";

/** Shape-tool state mutated during a drag gesture. */
export interface ToolDragState {
    shape: Shape | null;
    startX: number;
    startY: number;
    width: number;
    height: number;
    boundTextId: string | undefined;
}

/** Shared mutable state carried through the pointer tool handlers. */
export interface PointerToolState {
    /** In-progress drag state for shape tools. */
    drag: ToolDragState;
    /** Drawing buffers for pen/eraser/polyline. */
    drawing: ReturnType<typeof createDrawingState>;
}

export function createToolState(): PointerToolState {
    return {
        drag: {
            shape: null,
            startX: 0,
            startY: 0,
            width: 0,
            height: 0,
            boundTextId: undefined,
        },
        drawing: createDrawingState(),
    };
}

/** Handle pointer down while the Select tool is active. */
export function handleSelectPointerDown(
    coords: [number, number],
    shiftKey: boolean,
    state: PointerToolState,
    context: GameContext,
    api: PointerInteractionApi,
    e: MouseEvent,
) {
    const lockedIds = new Set(context.existingShapes.filter((s) => s.locked).map((s) => s.id!));
    const hit = hitTest(coords, context.existingShapes, context.viewport.zoom, lockedIds);

    if (context.selectedIds.size === 1) {
        const handleIdx = hitTestResizeHandle(coords, context);
        if (handleIdx === -2) {
            const id = [...context.selectedIds][0];
            const shape = context.existingShapes.find((s) => s.id === id);
            if (shape) {
                const bounds = getShapeBounds(shape);
                if (bounds) {
                    const cx = bounds.x + bounds.w / 2;
                    const cy = bounds.y + bounds.h / 2;
                    context.pointerInteractionManager.isRotating = true;
                    context.pointerInteractionManager.rotateStartAngle = Math.atan2(coords[1] - cy, coords[0] - cx);
                    context.pointerInteractionManager.rotateStartRotation = shape.rotation ?? 0;
                    context.pointerInteractionManager.dragStartShapes = structuredClone(context.existingShapes);
                    return;
                }
            }
        } else if (handleIdx !== -1) {
            const id = [...context.selectedIds][0];
            const shape = context.existingShapes.find((s) => s.id === id);
            if (shape) {
                context.pointerInteractionManager.isResizing = true;
                context.pointerInteractionManager.resizeHandle = handleIdx;
                context.pointerInteractionManager.resizeShiftKey = shiftKey;
                context.pointerInteractionManager.resizeStartBounds = getShapeBounds(shape)!;
                context.pointerInteractionManager.dragStartShapes = structuredClone(context.existingShapes);
                return;
            }
        }
    }

    if (hit !== null) {
        const hitShape = context.existingShapes[hit];

        if (shiftKey) {
            if (context.selectedIds.has(hitShape.id!)) {
                context.selectedIds.delete(hitShape.id!);
            } else {
                context.selectedIds.add(hitShape.id!);
            }
            api.notifySelection();
            api.clearCanvas();
            return;
        }

        if (hitShape.groupId && !(e.metaKey || e.ctrlKey)) {
            context.selectedIds = new Set();
            for (const s of context.existingShapes) {
                if (s.groupId === hitShape.groupId && s.id) {
                    context.selectedIds.add(s.id);
                }
            }
        } else {
            context.selectedIds = new Set([hitShape.id!]);
        }
        api.notifySelection();
        context.pointerInteractionManager.isDragging = true;
        context.pointerInteractionManager.dragOffsetX = coords[0];
        context.pointerInteractionManager.dragOffsetY = coords[1];
        context.pointerInteractionManager.dragStartShapes = structuredClone(context.existingShapes);
        context.pointerInteractionManager.dragStartPoint = { x: coords[0], y: coords[1] };
        context.pointerInteractionManager.lastSnappedDelta = { x: 0, y: 0 };
        context.pointerInteractionManager.dragStartBounds = selectionBounds(context.pointerInteractionManager.dragStartShapes);
    } else {
        context.selectedIds.clear();
        api.notifySelection();
        context.pointerInteractionManager.isSelecting = true;
        context.pointerInteractionManager.dragOffsetX = 0;
        context.pointerInteractionManager.dragOffsetY = 0;
    }
}

/** Handle pointer down while the Text tool is active. */
export function handleTextPointerDown(
    coords: [number, number],
    state: PointerToolState,
    context: GameContext,
    api: PointerInteractionApi,
) {
    const hit = hitTest(coords, context.existingShapes, context.viewport.zoom);
    if (hit !== null) {
        const shape = context.existingShapes[hit];
        if (shape.type === "text") {
            api.startTextEdit(shape.x, shape.y, shape.text, hit, {
                bold: shape.bold,
                italic: shape.italic,
                fontFamily: shape.fontFamily,
                fontSize: shape.fontSize,
                textAlign: shape.textAlign || "left",
            });
            return;
        }
    }
    api.startTextEdit(context.pointerInteractionManager.startX, context.pointerInteractionManager.startY, undefined, undefined, {
        bold: context.textManager.textBold,
        italic: context.textManager.textItalic,
        fontFamily: context.textManager.textFontFamily,
        fontSize: context.textManager.textFontSize,
        textAlign: context.textManager.textAlign,
    });
}

/** Handle pointer down while the Image tool is active. */
export function handleImagePointerDown(
    coords: [number, number],
    state: PointerToolState,
    context: GameContext,
    api: PointerInteractionApi,
) {
    api.openImagePicker(coords);
    context.pointerInteractionManager.clicked = false;
}

/** Handle pointer down while the Eyedropper tool is active. */
export function handleEyedropperPointerDown(
    coords: [number, number],
    state: PointerToolState,
    context: GameContext,
    api: PointerInteractionApi,
) {
    const hit = hitTest(coords, context.existingShapes, context.viewport.zoom);
    if (hit !== null) {
        const shape = context.existingShapes[hit];
        if (shape.style?.strokeColor) {
            const resolved = resolveStrokeColor(shape.style, context.isDark);
            context.currentStyle = { ...context.currentStyle, strokeColor: resolved };
            context._styleCustomized = true;
            api.styleChangeCallback?.();
        }
    }
    api.setTool("select");
    context.pointerInteractionManager.clicked = false;
}

/** Handle pointer down while the Line tool is active. */
export function handleLinePointerDown(
    state: PointerToolState,
    context: GameContext,
) {
    if (!state.drawing.isDrawingPolyline) {
        state.drawing.polylinePoints = [[context.pointerInteractionManager.startX, context.pointerInteractionManager.startY]];
        state.drawing.isDrawingPolyline = true;
    } else {
        state.drawing.polylinePoints.push([context.pointerInteractionManager.startX, context.pointerInteractionManager.startY]);
    }
    state.drawing.polylineStartCount = state.drawing.polylinePoints.length;
}

/** Handle pointer down while a shape tool (rect/circle/diamond/etc.) is active. */
export function handleShapeToolPointerDown(
    coords: [number, number],
    state: PointerToolState,
    context: GameContext,
) {
    const startX = context.pointerInteractionManager.startX;
    const startY = context.pointerInteractionManager.startY;
    const width = coords[0] - startX;
    const height = coords[1] - startY;

    if (context.selectedTool === "rect") {
        state.drag.shape = {
            type: "rect",
            x: Math.min(startX, coords[0]),
            y: Math.min(startY, coords[1]),
            width: Math.abs(width) || 100,
            height: Math.abs(height) || 100,
        };
    } else if (context.selectedTool === "circle") {
        const size = Math.max(Math.abs(width), Math.abs(height));
        const centerX = startX + (coords[0] < startX ? -size : size) / 2;
        const centerY = startY + (coords[1] < startY ? -size : size) / 2;
        state.drag.shape = {
            type: "circle",
            radius: size / 2,
            centerX,
            centerY,
        };
        } else if (context.selectedTool === "diamond") {
            state.drag.shape = {
                type: "diamond",
                centerX: startX + width / 2,
                centerY: startY + height / 2,
                width: Math.abs(width) || 100,
                height: Math.abs(height) || 100,
            };
        } else if (context.selectedTool === "ellipsisArc") {
            state.drag.shape = {
                type: "ellipsisArc",
                centerX: startX + width / 2,
                centerY: startY + height / 2,
                width: Math.abs(width) || 100,
                height: Math.abs(height) || 100,
                startAngle: 0,
                endAngle: Math.PI,
            };
        } else if (context.selectedTool === "arrow") {
            const startBind = context.pointerInteractionManager.startBinding;
            const endBind = context.pointerInteractionManager.endBinding;
            state.drag.shape = {
                type: "arrow",
                startX: startBind?.x ?? startX,
                startY: startBind?.y ?? startY,
                endX: endBind?.x ?? coords[0],
                endY: endBind?.y ?? coords[1],
                arrowHeadSize: 10,
                startBinding: startBind?.id,
                endBinding: endBind?.id,
            };
    } else if (context.selectedTool === "stickyNote") {
        const noteColor = STICKY_NOTES[Math.floor(Math.random() * STICKY_NOTES.length)];
        state.drag.shape = {
            type: "stickyNote",
            x: Math.min(startX, coords[0]),
            y: Math.min(startY, coords[1]),
            width: Math.abs(width) || 150,
            height: Math.abs(height) || 150,
            noteColor,
            text: "",
        };
    } else if (context.selectedTool === "frame") {
        const frameCount = context.existingShapes.filter((s) => s.type === "frame").length;
        state.drag.shape = {
            type: "frame",
            x: Math.min(startX, coords[0]),
            y: Math.min(startY, coords[1]),
            width: Math.abs(width) || 300,
            height: Math.abs(height) || 200,
            name: `Frame ${frameCount + 1}`,
        };
    }

    if (state.drag.shape) {
        state.drag.startX = startX;
        state.drag.startY = startY;
        state.drag.width = width;
        state.drag.height = height;
        state.drag.boundTextId = state.drag.shape.boundTextId;
    }
}

// ---- Helpers moved from Game ----

function selectionBounds(shapes: Shape[]): Bounds | null {
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

function hitTestResizeHandle(coords: [number, number], context: GameContext): number {
    const id = [...context.selectedIds][0];
    const shape = context.existingShapes.find((s) => s.id === id);
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
    const handleSize = 8 / context.viewport.zoom;
    for (let i = 0; i < handles.length; i++) {
        const dx = coords[0] - handles[i].x;
        const dy = coords[1] - handles[i].y;
        if (dx * dx + dy * dy <= handleSize * handleSize) return i;
    }
    const [cx, cy] = getShapeCenter(shape);
    const dist = Math.hypot(coords[0] - cx, coords[1] - cy);
    const rotationHandleDist = 30 / context.viewport.zoom;
    if (dist <= rotationHandleDist) return -2;
    return -1;
}
