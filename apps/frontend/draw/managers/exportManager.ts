import { Shape, ensureShapesHaveStyle } from "@repo/shapes";
import { exportToPng, exportToSvg, exportToJson } from "../exporter";
import type { ImageCache } from "../imageCache";
import type { GameContext } from "../gameContext";

/** Capabilities the ExportManager needs from the owning Game instance. */
export interface ExportManagerApi {
    notifySelection(): void;
    syncShapes(): void;
    imageCache: ImageCache;
}

/**
 * Canvas export and import.
 *
 * Renders the current shape list to PNG/SVG downloads, serializes shapes
 * to JSON, and replaces the canvas contents from an imported JSON string.
 */
export class ExportManager {
    constructor(
        private context: GameContext,
        private api: ExportManagerApi,
    ) {}

    /**
     * Export the canvas as a PNG image download.
     *
     * Renders all shapes to an offscreen canvas at 1:1 scale and
     * triggers a browser download of the resulting PNG file.
     */
    exportToPng() {
        exportToPng(this.context.existingShapes, this.context.isDark, this.api.imageCache);
    }

    /**
     * Export the canvas as an SVG image download.
     *
     * Builds an SVG DOM from all shapes, serializes it, and triggers
     * a browser download of the resulting SVG file.
     */
    exportToSvg() {
        exportToSvg(this.context.existingShapes, this.context.isDark);
    }

    /**
     * Export the canvas shapes as a JSON file download.
     *
     * Serializes the shape array as pretty-printed JSON and triggers
     * a browser download. The JSON can be re-imported via {@link importFromJson}.
     */
    exportToJson() {
        exportToJson(this.context.existingShapes);
    }

    /**
     * Import shapes from a JSON string (file or clipboard).
     * Replaces all existing shapes with the imported ones.
     * @param jsonString - JSON string containing shapes
     */
    importFromJson(jsonString: string) {
        try {
            const parsed = JSON.parse(jsonString);
            const shapes = parsed.shapes ?? (Array.isArray(parsed) ? parsed : [parsed]);
            const prev = [...this.context.existingShapes];
            this.context.existingShapes = ensureShapesHaveStyle(
                shapes.filter((s: Shape) => s.type !== "eraser"),
            );
            this.context.undoManager.push(prev, this.context.existingShapes);
            this.context.selectedIds.clear();
            this.api.notifySelection();
            this.api.syncShapes();
        } catch {
            console.error("Invalid JSON file");
        }
    }
}
