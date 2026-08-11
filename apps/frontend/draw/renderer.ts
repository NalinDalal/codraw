/**
 * Rendering and hit-testing utilities for the canvas drawing engine.
 *
 * All shape drawing goes through {@link renderShape}, which delegates to
 * Rough.js for the hand-drawn aesthetic. Hit-testing is handled by
 * {@link hitTest} (point-in-shape) and {@link hitTestWithRadius}
 * (proximity-based, used by the eraser tool).
 *
 * @module renderer
 */

import rough from "roughjs";
import { Shape, ShapeStyle, Bounds, Point, defaultStyle, getShapeBounds, getShapeCenter, rotatePointAround, distToSegment } from "@repo/shapes";
import { Viewport } from "./viewport";
import { ImageCache } from "./imageCache";

/**
 * Build Rough.js drawing options from a shape's style.
 *
 * Roughness and bowing are always forced to 0, producing clean
 * geometric strokes instead of hand-drawn ones.
 *
 * @param strokeWidth - Stroke width adjusted for current zoom level
 * @param st - Shape style containing colors, roughness, etc.
 * @returns Options object compatible with Rough.js drawing methods
 */
export function buildRoughOpts(strokeWidth: number, st: ShapeStyle) {
    return {
        stroke: st.strokeColor,
        strokeWidth,
        roughness: 0,
        bowing: 0,
        fill: st.backgroundColor !== "transparent" ? st.backgroundColor : undefined,
        fillStyle: st.backgroundColor !== "transparent" ? (st.fillStyle ?? "solid") : undefined,
        fillWeight: 1,
        hachureGap: 4,
    };
}

/**
 * Render a single shape onto a canvas context.
 *
 * Dispatches to the appropriate Rough.js or native canvas method based on
 * shape type. Handles opacity via `globalAlpha` and delegates image
 * rendering to the {@link ImageCache}.
 *
 * Arrow heads are drawn as filled triangles using native canvas (not Rough.js)
 * so they remain crisp at all zoom levels.
 *
 * @param shape - The shape to render
 * @param ctx - Target canvas 2D context
 * @param roughInstance - Rough.js canvas binding for hand-drawn strokes
 * @param zoom - Current viewport zoom (used to scale stroke width)
 * @param isDark - Current theme (fallback for shapes without a style)
 * @param imageCache - LRU cache for loaded image elements
 */
export function renderShape(
    shape: Shape,
    ctx: CanvasRenderingContext2D,
    roughInstance: ReturnType<typeof rough.canvas>,
    zoom: number,
    isDark: boolean,
    imageCache: ImageCache,
) {
    const st = shape.style ?? defaultStyle(isDark);
    const opts = buildRoughOpts(st.strokeWidth / zoom, st);
    ctx.globalAlpha = st.opacity;
    const rotated = !!shape.rotation;
    if (rotated) {
        const [cx, cy] = getShapeCenter(shape);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(shape.rotation!);
        ctx.translate(-cx, -cy);
    }
    try {
        if (shape.type === "rect") {
            const x = Math.min(shape.x, shape.x + shape.width);
            const y = Math.min(shape.y, shape.y + shape.height);
            const w = Math.abs(shape.width);
            const h = Math.abs(shape.height);
            roughInstance.rectangle(x, y, w, h, opts);
        } else if (shape.type === "circle") {
            roughInstance.circle(shape.centerX, shape.centerY, Math.abs(shape.radius) * 2, opts);
        } else if (shape.type === "ellipsisArc") {
            const rx = Math.abs(shape.width) / 2;
            const ry = Math.abs(shape.height) / 2;
            if (rx > 0 && ry > 0) {
                ctx.beginPath();
                ctx.ellipse(shape.centerX, shape.centerY, rx, ry, 0, shape.startAngle, shape.endAngle);
                ctx.strokeStyle = st.strokeColor;
                ctx.lineWidth = st.strokeWidth / zoom;
                ctx.stroke();
            }
        } else if (shape.type === "diamond") {
            const cx = shape.centerX;
            const cy = shape.centerY;
            const hw = shape.width / 2;
            const hh = shape.height / 2;
            roughInstance.polygon(
                [[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]],
                opts,
            );
        } else if (shape.type === "pencil") {
            if (shape.constantWidth && shape.points.length > 1) {
                ctx.beginPath();
                ctx.moveTo(shape.points[0][0], shape.points[0][1]);
                for (let j = 1; j < shape.points.length; j++) {
                    ctx.lineTo(shape.points[j][0], shape.points[j][1]);
                }
                ctx.strokeStyle = st.strokeColor;
                ctx.lineWidth = st.strokeWidth / zoom;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";
                ctx.stroke();
            } else {
                roughInstance.linearPath(shape.points, opts);
            }
        } else if (shape.type === "line") {
            if (shape.points && shape.points.length > 2) {
                roughInstance.linearPath(shape.points, opts);
            } else {
                roughInstance.line(shape.startX, shape.startY, shape.endX, shape.endY, opts);
            }
        } else if (shape.type === "arrow") {
            const dx = shape.endX - shape.startX;
            const dy = shape.endY - shape.startY;
            const angle = Math.atan2(dy, dx);
            roughInstance.line(shape.startX, shape.startY, shape.endX, shape.endY, opts);
            const headLen = shape.arrowHeadSize;
            const a1 = angle - Math.PI / 6;
            const a2 = angle + Math.PI / 6;
            ctx.beginPath();
            ctx.moveTo(shape.endX, shape.endY);
            ctx.lineTo(shape.endX - headLen * Math.cos(a1), shape.endY - headLen * Math.sin(a1));
            ctx.lineTo(shape.endX - headLen * Math.cos(a2), shape.endY - headLen * Math.sin(a2));
            ctx.closePath();
            ctx.fillStyle = st.strokeColor;
            ctx.fill();
            // Draw label at arrow midpoint
            if (shape.label) {
                const mx = (shape.startX + shape.endX) / 2;
                const my = (shape.startY + shape.endY) / 2;
                ctx.font = "14px Arial";
                ctx.fillStyle = st.strokeColor;
                ctx.textAlign = "center";
                ctx.textBaseline = "bottom";
                // Offset label above the arrow line
                const labelOffset = 8;
                const perpX = -Math.sin(angle) * labelOffset;
                const perpY = Math.cos(angle) * labelOffset;
                ctx.fillText(shape.label, mx + perpX, my + perpY);
                ctx.textAlign = "start";
                ctx.textBaseline = "alphabetic";
            }
        } else if (shape.type === "text") {
            const weight = shape.bold ? "bold " : "";
            const style = shape.italic ? "italic " : "";
            const family = shape.fontFamily || "Arial";
            ctx.font = `${style}${weight}${shape.fontSize}px ${family}`;
            ctx.fillStyle = st.strokeColor;
            ctx.textAlign = shape.textAlign || "left";
            ctx.textBaseline = "top";
            const lines = shape.text.split("\n");
            const lineHeight = shape.fontSize * 1.25;
            for (let i = 0; i < lines.length; i++) {
                ctx.fillText(lines[i], shape.x, shape.y + i * lineHeight);
            }
            ctx.textAlign = "start";
            ctx.textBaseline = "alphabetic";
        } else if (shape.type === "image") {
            const img = imageCache.get(shape.imageData);
            if (img?.complete) {
                ctx.drawImage(img, shape.x, shape.y, shape.width, shape.height);
            } else {
                ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
                ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
                ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 0, 0, 0.12)";
                ctx.lineWidth = 1;
                ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
                ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.45)" : "rgba(0, 0, 0, 0.35)";
                ctx.font = "12px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("Loading...", shape.x + shape.width / 2, shape.y + shape.height / 2);
                ctx.textAlign = "start";
                ctx.textBaseline = "alphabetic";
            }
        } else if (shape.type === "stickyNote") {
            // Draw note background
            ctx.fillStyle = shape.noteColor;
            ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
            // Draw shadow
            ctx.shadowColor = "rgba(0,0,0,0.2)";
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            // Draw text
            ctx.fillStyle = "#000000";
            ctx.font = "14px Arial";
            const lines = shape.text.split("\n");
            for (let i = 0; i < lines.length; i++) {
                ctx.fillText(lines[i], shape.x + 10, shape.y + 24 + i * 18);
            }
        } else if (shape.type === "eraser") {
            // Legacy eraser strokes are no longer rendered
        } else if (shape.type === "frame") {
            // Draw frame border
            ctx.strokeStyle = st.strokeColor === "#ffffff" ? "rgba(59, 130, 246, 0.8)" : st.strokeColor;
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
            // Draw label background
            const labelHeight = 24;
            ctx.fillStyle = ctx.strokeStyle;
            ctx.fillRect(shape.x, shape.y - labelHeight, shape.width, labelHeight);
            // Draw label text
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 12px Arial";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(shape.name, shape.x + 8, shape.y - labelHeight / 2);
            ctx.textAlign = "start";
            ctx.textBaseline = "alphabetic";
        }

        if (shape.url) {
            const bounds = getShapeBounds(shape);
            if (bounds) {
                const tagW = 40;
                const tagH = 16;
                const tagX = bounds.x + bounds.w - tagW;
                const tagY = bounds.y;
                ctx.fillStyle = "#3b82f6";
                ctx.fillRect(tagX, tagY, tagW, tagH);
                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 9px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("LINK", tagX + tagW / 2, tagY + tagH / 2);
                ctx.textAlign = "start";
                ctx.textBaseline = "alphabetic";
            }
        }
    } finally {
        ctx.globalAlpha = 1;
        if (rotated) ctx.restore();
    }
}

/**
 * Draw selection indicators (dashed blue rectangles) around all selected shapes.
 *
 * @param ctx - Target canvas 2D context
 * @param shapes - All shapes on the canvas
 * @param selectedIds - Set of selected shape IDs
 * @param viewport - Current viewport transform
 */
export function drawSelection(
    ctx: CanvasRenderingContext2D,
    shapes: Shape[],
    selectedIds: Set<string>,
    viewport: Viewport,
) {
    ctx.save();
    ctx.translate(viewport.panX, viewport.panY);
    ctx.scale(viewport.zoom, viewport.zoom);
    const shapeMap = new Map(shapes.filter(s => s.id).map(s => [s.id!, s]));
    const handleSize = 6 / viewport.zoom;
    for (const id of selectedIds) {
        const shape = shapeMap.get(id);
        if (!shape) continue;
        const bounds = getShapeBounds(shape);
        if (!bounds) continue;
        ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
        ctx.lineWidth = 1.5 / viewport.zoom;
        ctx.setLineDash([4 / viewport.zoom, 4 / viewport.zoom]);
        ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
        ctx.setLineDash([]);

        // Draw resize handles
        ctx.fillStyle = "white";
        ctx.strokeStyle = "rgba(59, 130, 246, 0.7)";
        ctx.lineWidth = 1 / viewport.zoom;
        const handles = [
            { x: bounds.x, y: bounds.y },                         // top-left
            { x: bounds.x + bounds.w / 2, y: bounds.y },         // top-center
            { x: bounds.x + bounds.w, y: bounds.y },              // top-right
            { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 }, // middle-right
            { x: bounds.x + bounds.w, y: bounds.y + bounds.h },  // bottom-right
            { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h }, // bottom-center
            { x: bounds.x, y: bounds.y + bounds.h },              // bottom-left
            { x: bounds.x, y: bounds.y + bounds.h / 2 },         // middle-left
        ];
        for (const h of handles) {
            const hs = handleSize / 2;
            ctx.fillRect(h.x - hs, h.y - hs, handleSize, handleSize);
            ctx.strokeRect(h.x - hs, h.y - hs, handleSize, handleSize);
        }

        // Draw rotation handle (only when a single shape is selected,
        // since rotation only applies to one shape at a time)
        if (selectedIds.size === 1) {
            const rotationHandleY = bounds.y - 24 / viewport.zoom;
            const rotationHandleX = bounds.x + bounds.w / 2;
            ctx.beginPath();
            ctx.arc(rotationHandleX, rotationHandleY, handleSize / 2, 0, Math.PI * 2);
            ctx.fillStyle = "white";
            ctx.fill();
            ctx.strokeStyle = "rgba(59, 130, 246, 0.7)";
            ctx.stroke();
            // Draw line from shape to rotation handle
            ctx.beginPath();
            ctx.moveTo(bounds.x + bounds.w / 2, bounds.y);
            ctx.lineTo(rotationHandleX, rotationHandleY);
            ctx.stroke();
        }
    }
    ctx.restore();
}

/**
 * Draw the rubber-band selection rectangle during drag-select.
 *
 * Renders a translucent blue fill with a dashed border to indicate
 * the area being selected.
 *
 * @param ctx - Target canvas 2D context
 * @param startX - Mouse-down X in canvas coordinates
 * @param startY - Mouse-down Y in canvas coordinates
 * @param currentX - Current mouse X in canvas coordinates
 * @param currentY - Current mouse Y in canvas coordinates
 * @param viewport - Current viewport transform
 */
export function drawDragSelect(
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    currentX: number,
    currentY: number,
    viewport: Viewport,
) {
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const w = Math.abs(currentX - startX);
    const h = Math.abs(currentY - startY);
    ctx.strokeStyle = "rgba(59, 130, 246, 0.6)";
    ctx.lineWidth = 1.5 / viewport.zoom;
    ctx.setLineDash([4 / viewport.zoom, 4 / viewport.zoom]);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "rgba(59, 130, 246, 0.06)";
    ctx.fillRect(x, y, w, h);
    ctx.setLineDash([]);
}

/**
  * Test whether a point hits any shape on the canvas.
  *
  * Iterates shapes back-to-front (topmost first) and returns the index
  * of the first shape containing the point. Uses shape-specific geometry:
  * - Rectangles, images, diamonds, text: axis-aligned bounding box
  * - Circles: distance from center
  * - Pencil, lines, arrows, erasers: distance to line segments
  *
  * @param point - Test point in canvas coordinates
  * @param shapes - All shapes to test against
  * @param zoom - Current viewport zoom (adjusts hit tolerance)
  * @param lockedIds - Optional set of shape IDs to skip (locked shapes)
  * @returns Index of the hit shape, or `null` if none
  */
export function hitTest(
    point: Point,
    shapes: Shape[],
    zoom: number,
    lockedIds?: Set<string>,
): number | null {
    for (let i = shapes.length - 1; i >= 0; i--) {
        const shape = shapes[i];
        if (lockedIds?.has(shape.id!)) continue;
        let p = point;
        if (shape.rotation) {
            const [cx, cy] = getShapeCenter(shape);
            p = rotatePointAround(point, cx, cy, -shape.rotation);
        }
        if (shape.type === "rect") {
            const minX = Math.min(shape.x, shape.x + shape.width);
            const maxX = Math.max(shape.x, shape.x + shape.width);
            const minY = Math.min(shape.y, shape.y + shape.height);
            const maxY = Math.max(shape.y, shape.y + shape.height);
            if (
                p[0] >= minX &&
                p[0] <= maxX &&
                p[1] >= minY &&
                p[1] <= maxY
            ) {
                return i;
            }
        } else if (shape.type === "circle") {
            const dx = p[0] - shape.centerX;
            const dy = p[1] - shape.centerY;
            if (Math.sqrt(dx * dx + dy * dy) <= Math.abs(shape.radius)) {
                return i;
            }
        } else if (shape.type === "ellipsisArc") {
            const hw = Math.abs(shape.width) / 2;
            const hh = Math.abs(shape.height) / 2;
            if (
                p[0] >= shape.centerX - hw &&
                p[0] <= shape.centerX + hw &&
                p[1] >= shape.centerY - hh &&
                p[1] <= shape.centerY + hh
            ) {
                return i;
            }
        } else if (shape.type === "pencil") {
            for (let j = 1; j < shape.points.length; j++) {
                const dist = distToSegment(p, shape.points[j - 1], shape.points[j]);
                if (dist < 10 / zoom) return i;
            }
        } else if (shape.type === "text") {
            const boldFactor = shape.bold ? 1.15 : 1;
            const lines = shape.text.split("\n");
            let maxLen = 0;
            for (const l of lines) maxLen = Math.max(maxLen, l.length);
            const textWidth = maxLen * (shape.fontSize * 0.6) * boldFactor;
            const textHeight = lines.length * shape.fontSize * 1.25;
            if (
                p[0] >= shape.x &&
                p[0] <= shape.x + textWidth &&
                p[1] >= shape.y &&
                p[1] <= shape.y + textHeight
            ) {
                return i;
            }
        } else if (shape.type === "image") {
            if (
                p[0] >= shape.x &&
                p[0] <= shape.x + shape.width &&
                p[1] >= shape.y &&
                p[1] <= shape.y + shape.height
            ) {
                return i;
            }
        } else if (shape.type === "stickyNote") {
            if (
                p[0] >= shape.x &&
                p[0] <= shape.x + shape.width &&
                p[1] >= shape.y &&
                p[1] <= shape.y + shape.height
            ) {
                return i;
            }
        } else if (shape.type === "frame") {
            // Hit-test including the label area above the frame
            if (
                p[0] >= shape.x &&
                p[0] <= shape.x + shape.width &&
                p[1] >= shape.y - 24 &&
                p[1] <= shape.y + shape.height
            ) {
                return i;
            }
        } else if (shape.type === "diamond") {
            const hw = shape.width / 2;
            const hh = shape.height / 2;
            if (
                p[0] >= shape.centerX - hw &&
                p[0] <= shape.centerX + hw &&
                p[1] >= shape.centerY - hh &&
                p[1] <= shape.centerY + hh
            ) {
                return i;
            }
        } else if (shape.type === "arrow" || shape.type === "line") {
            if (shape.type === "line" && shape.points && shape.points.length > 2) {
                // Hit-test all segments of the polyline
                for (let j = 1; j < shape.points.length; j++) {
                    const dist = distToSegment(p, shape.points[j - 1], shape.points[j]);
                    if (dist < 10 / zoom) return i;
                }
            } else {
                const dist = distToSegment(
                    p,
                    [shape.startX, shape.startY],
                    [shape.endX, shape.endY],
                );
                if (dist < 10 / zoom) return i;
            }
        } else if (shape.type === "eraser") {
            for (let j = 1; j < shape.points.length; j++) {
                const dist = distToSegment(p, shape.points[j - 1], shape.points[j]);
                if (dist < shape.strokeWidth / 2) return i;
            }
        }
    }
    return null;
}

/**
 * Proximity-based hit test using shape bounding boxes.
 *
 * Used by the eraser tool: if any point along the eraser path is within
 * `radius` pixels of a shape's bounding box, the shape is considered
 * intersected.
 *
 * @param point - Test point in canvas coordinates
 * @param shapes - All shapes to test against
 * @param radius - Maximum distance from shape bounds to count as a hit
 * @returns Index of the nearest shape within radius, or `null`
 */
export function hitTestWithRadius(
    point: Point,
    shapes: Shape[],
    radius: number,
): number | null {
    for (let i = shapes.length - 1; i >= 0; i--) {
        const bounds = getShapeBounds(shapes[i]);
        if (!bounds) continue;
        const closestX = Math.max(bounds.x, Math.min(point[0], bounds.x + bounds.w));
        const closestY = Math.max(bounds.y, Math.min(point[1], bounds.y + bounds.h));
        const dx = point[0] - closestX;
        const dy = point[1] - closestY;
        if (dx * dx + dy * dy <= radius * radius) {
            return i;
        }
    }
    return null;
}

/**
 * Check whether any eraser point falls within the padded bounds of a shape.
 *
 * This is a fast broad-phase check: it only tests whether the eraser
 * path enters the shape's bounding box (expanded by the eraser radius),
 * not whether it overlaps the actual drawn path.
 *
 * @param eraserPoints - Points along the eraser stroke
 * @param shape - The shape to test for intersection
 * @param eraserRadius - Radius of the eraser tool
 * @returns `true` if the eraser intersects the shape's bounds
 */
export function eraserIntersectsShape(
    eraserPoints: Point[],
    shape: Shape,
    eraserRadius: number,
): boolean {
    const bounds = getShapeBounds(shape);
    if (!bounds) return false;
    const pad = eraserRadius;
    const bx = bounds.x - pad;
    const by = bounds.y - pad;
    const bw = bounds.w + pad * 2;
    const bh = bounds.h + pad * 2;

    for (const pt of eraserPoints) {
        if (
            pt[0] >= bx &&
            pt[0] <= bx + bw &&
            pt[1] >= by &&
            pt[1] <= by + bh
        ) {
            return true;
        }
    }
    return false;
}
