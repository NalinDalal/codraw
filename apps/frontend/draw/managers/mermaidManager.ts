import { Shape, Bounds } from "@repo/shapes";
import { generateFromMermaid } from "../mermaid";
import { moveShape } from "../inputHandler";
import { uuid } from "@/lib/uuid";
import type { GameContext } from "../gameContext";

/** Capabilities the MermaidManager needs from the owning Game instance. */
export interface MermaidManagerApi {
    getMultipleBounds(shapes: Shape[]): Bounds | null;
    invalidateCache(): void;
    clearCanvas(): void;
    syncShapes(): void;
}

/**
 * Mermaid diagram import.
 *
 * Parses a Mermaid flowchart definition, converts it into shape objects,
 * offsets the result to the requested position, and commits the shapes
 * to the canvas.
 */
export class MermaidManager {
    constructor(
        private context: GameContext,
        private api: MermaidManagerApi,
    ) {}

    /** Import a Mermaid diagram and add shapes to the canvas */
    importFromMermaid(text: string, x = 200, y = 200): Shape[] {
        const shapes = generateFromMermaid(text);
        // Offset all shapes to the given position
        if (shapes.length > 0) {
            const bounds = this.api.getMultipleBounds(shapes);
            if (bounds) {
                const dx = x - bounds.x;
                const dy = y - bounds.y;
                for (const s of shapes) moveShape(s, dx, dy);
            }
        }
        const prev = [...this.context.existingShapes];
        for (const s of shapes) {
            s.id = uuid();
            s.style = { ...this.context.currentStyle };
        }
        this.context.existingShapes.push(...shapes);
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.invalidateCache();
        this.api.clearCanvas();
        this.api.syncShapes();
        return shapes;
    }
}
