import { defaultStyle, CanvasBackground, Shape, ShapeStyle, Tool } from "@repo/shapes";
import { UndoManager } from "./undoManager";
import { Viewport } from "./viewport";
import type { LibraryManager } from "./managers/libraryManager";
import type { HistoryManager } from "./managers/historyManager";
import type { ExportManager } from "./managers/exportManager";
import type { MermaidManager } from "./managers/mermaidManager";
import type { PluginManager } from "./managers/pluginManager";
import type { LaserManager } from "./managers/laserManager";
import type { StyleManager } from "./managers/styleManager";
import type { ArrowManager } from "./managers/arrowManager";
import type { ImageManager } from "./managers/imageManager";
import type { TextManager } from "./managers/textManager";
import type { RenderManager } from "./managers/renderManager";
import type { ShapeManager } from "./managers/shapeManager";
import type { CursorManager } from "./managers/cursorManager";
import type { AutoSaveManager } from "./managers/autoSaveManager";
import type { ClipboardManager } from "./managers/clipboardManager";
import type { KeyboardManager } from "./managers/keyboardManager";
import type { WebSocketSyncManager } from "./managers/webSocketSyncManager";
import type { PointerInteractionManager } from "./managers/pointerInteractionManager";
import type { MouseManager } from "./managers/mouseManager";
import type { TouchManager } from "./managers/touchManager";
import type { NavigationManager } from "./managers/navigationManager";
import type { ToolManager } from "./managers/toolManager";

/**
 * Shared mutable state for the drawing engine.
 *
 * Holds state that is read and written across the whole game: shape data,
 * selection, viewport transform, undo stack, style, mode flags, canvas
 * dimensions, and crop/laser/trash state. As managers are extracted from
 * Game.ts they reach each other only through this context — never via
 * direct cross-imports.
 */
export class GameContext {
    existingShapes: Shape[] = [];
    selectedIds = new Set<string>();
    viewport = new Viewport();
    undoManager = new UndoManager();

    /** Whether dark mode is active; drives default stroke color and background */
    isDark = false;
    /** Default style applied to newly created shapes */
    currentStyle: ShapeStyle = defaultStyle(false);

    /** Grid spacing in canvas units */
    gridSize = 20;
    snapToGrid = false;
    snapToObjects = true;
    stayAfterDraw = true;
    zenMode = false;
    viewMode = false;
    _locked = false;
    _handMode = false;
    _styleCustomized = false;
    _background: CanvasBackground = { type: "dots", color: "rgb(0,0,0)", dotSize: 1.5, spacing: 20 };
    _backgroundCustom = false;

    /** Alignment guide lines currently shown during drag */
    alignmentGuides: Array<{ x?: number; y?: number }> = [];

    /** Deleted shapes pending recovery */
    trash: Shape[] = [];

    /** Snapshot of shapes at the last successful sync */
    lastSyncedShapes: Shape[] = [];
    /** Server version at the last successful save */
    lastSavedVersion = 0;

    /** Logical canvas width in CSS pixels (used for coordinate math) */
    cssWidth = 0;
    /** Logical canvas height in CSS pixels (used for coordinate math) */
    cssHeight = 0;
    /** Device pixel ratio, capped at 2 for performance */
    dpr = 1;

    // Image crop state
    cropMode = false;
    cropShapeId: string | null = null;
    cropRect: { x: number; y: number; w: number; h: number } | null = null;
    cropDragCorner: number | null = null;
    cropStartRect: { x: number; y: number; w: number; h: number } | null = null;

    // Laser pointer state
    laserPosition: { x: number; y: number } | null = null;
    laserColor = "#ef4444";
    laserSize = 6;

    // Manager references are added here as managers are extracted from
    // Game.ts. Managers reach each other only through this context —
    // never via direct cross-imports.
    libraryManager!: LibraryManager;
    historyManager!: HistoryManager;
    exportManager!: ExportManager;
    mermaidManager!: MermaidManager;
    pluginManager!: PluginManager;
    laserManager!: LaserManager;
    styleManager!: StyleManager;
    arrowManager!: ArrowManager;
    imageManager!: ImageManager;
    textManager!: TextManager;
    renderManager!: RenderManager;
    shapeManager!: ShapeManager;
    cursorManager!: CursorManager;
    autoSaveManager!: AutoSaveManager;
    clipboardManager!: ClipboardManager;
    keyboardManager!: KeyboardManager;
    webSocketSyncManager!: WebSocketSyncManager;
    pointerInteractionManager!: PointerInteractionManager;
    mouseManager!: MouseManager;
    touchManager!: TouchManager;
    navigationManager!: NavigationManager;
    toolManager!: ToolManager;

    get selectedTool(): Tool | string {
        return this._selectedTool;
    }
    set selectedTool(v: Tool | string) {
        this._selectedTool = v;
    }
    _selectedTool: Tool | string = "select";
    _previousTool: Tool | string = "select";
}
