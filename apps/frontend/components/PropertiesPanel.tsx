import { ShapeStyle } from "@repo/shapes";
import { X } from "lucide-react";
import { PopoverPanel } from "./PopoverPanel";
import { ShapeStyleSection } from "./ShapeStyleSection";

/** Human-readable labels for each shape type shown in the panel header */
const LABELS: Record<string, string> = {
    rect: "Rectangle",
    circle: "Circle",
    diamond: "Diamond",
    arrow: "Arrow",
    line: "Line",
    text: "Text",
    pencil: "Free draw",
    frame: "Frame",
};

/**
 * Properties panel for the active tool or the selected shape.
 *
 * The shared pen section (stroke, background, thickness, roughness,
 * opacity, web link) comes from {@link ShapeStyleSection}; this panel
 * adds the type-specific controls around it.
 *
 * On desktop (`docked`) it renders as a persistent sidebar beside the
 * tool rail, always visible while a tool or shape is selected — no
 * close button, no outside-click dismissal, Excalidraw-style. On small
 * screens it renders as a dismissible bottom sheet above the tool dock.
 */
export function PropertiesPanel({
    docked = false,
    shapeType,
    style,
    onStyleChange,
    arrowHeadSize,
    onArrowHeadSizeChange,
    textStyle,
    onTextStyleChange,
    url,
    onUrlChange,
    frameName,
    onFrameNameChange,
    onClose,
}: {
    docked?: boolean;
    shapeType: string;
    style: ShapeStyle;
    onStyleChange: (updates: Partial<ShapeStyle>) => void;
    arrowHeadSize?: number;
    onArrowHeadSizeChange?: (size: number) => void;
    textStyle?: { bold?: boolean; italic?: boolean; fontFamily?: string; fontSize?: number; textAlign?: "left" | "center" | "right" };
    onTextStyleChange?: (updates: { bold?: boolean; italic?: boolean; fontFamily?: string; fontSize?: number; textAlign?: "left" | "center" | "right" }) => void;
    url?: string;
    onUrlChange?: (url: string) => void;
    frameName?: string;
    onFrameNameChange?: (name: string) => void;
    onClose?: () => void;
}) {
    const FONTS = ["Arial", "Georgia", "Courier New", "Times New Roman", "Verdana", "Impact"];
    const content = (
        <>
            <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {LABELS[shapeType] ?? shapeType}
                </span>
                {!docked && onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close properties"
                        className="p-0.5 rounded text-muted-foreground transition-colors duration-100 hover:bg-secondary hover:text-foreground"
                    >
                        <X size={13} />
                    </button>
                )}
            </div>

            {shapeType === "frame" && onFrameNameChange && (
                <div className="px-3 mb-3">
                    <div className="text-xs text-muted-foreground mb-1.5">Frame Name</div>
                    <input
                        type="text"
                        value={frameName ?? ""}
                        onChange={(e) => onFrameNameChange(e.target.value)}
                        className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Frame name"
                    />
                </div>
            )}

            <ShapeStyleSection
                style={style}
                onStyleChange={onStyleChange}
                url={url}
                onUrlChange={onUrlChange}
            />

            {shapeType === "arrow" && onArrowHeadSizeChange && arrowHeadSize !== undefined && (
                <div className="px-3 mb-2">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Arrowhead</span>
                        <span>{arrowHeadSize}</span>
                    </div>
                    <input
                        type="range"
                        min="4"
                        max="30"
                        step="1"
                        value={arrowHeadSize}
                        onChange={(e) => onArrowHeadSizeChange(parseInt(e.target.value))}
                        className="w-full accent-primary"
                    />
                </div>
            )}

            {shapeType === "text" && textStyle && onTextStyleChange && (
                <>
                    <div className="px-3 mb-2">
                        <div className="text-xs text-muted-foreground mb-1.5">Font</div>
                        <select
                            value={textStyle.fontFamily || "Arial"}
                            onChange={(e) => onTextStyleChange({ fontFamily: e.target.value })}
                            className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            {FONTS.map((f) => (
                                <option key={f} value={f}>{f}</option>
                            ))}
                        </select>
                    </div>
                    <div className="px-3 mb-2">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Font Size</span>
                            <span>{textStyle.fontSize || 20}px</span>
                        </div>
                        <input
                            type="range"
                            min="10"
                            max="72"
                            step="2"
                            value={textStyle.fontSize || 20}
                            onChange={(e) => onTextStyleChange({ fontSize: parseInt(e.target.value) })}
                            className="w-full accent-primary"
                        />
                    </div>
                    <div className="flex gap-2 px-3 mb-2">
                        <button
                            onClick={() => onTextStyleChange?.({ bold: !textStyle.bold })}
                            aria-pressed={Boolean(textStyle.bold)}
                            className={`flex-1 py-1 text-xs rounded border transition-all ${
                                textStyle.bold
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background border-border hover:bg-secondary"
                            }`}
                        >
                            B
                        </button>
                        <button
                            onClick={() => onTextStyleChange?.({ italic: !textStyle.italic })}
                            aria-pressed={Boolean(textStyle.italic)}
                            className={`flex-1 py-1 text-xs rounded border transition-all italic ${
                                textStyle.italic
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background border-border hover:bg-secondary"
                            }`}
                        >
                            I
                        </button>
                    </div>
                    <div className="flex gap-2 px-3 mb-3">
                        <button
                            onClick={() => onTextStyleChange?.({ textAlign: "left" })}
                            aria-pressed={textStyle.textAlign === "left" || (!textStyle.textAlign)}
                            className={`flex-1 py-1 text-xs rounded border transition-all ${
                                !textStyle.textAlign || textStyle.textAlign === "left"
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background border-border hover:bg-secondary"
                            }`}
                        >
                            L
                        </button>
                        <button
                            onClick={() => onTextStyleChange?.({ textAlign: "center" })}
                            aria-pressed={textStyle.textAlign === "center"}
                            className={`flex-1 py-1 text-xs rounded border transition-all ${
                                textStyle.textAlign === "center"
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background border-border hover:bg-secondary"
                            }`}
                        >
                            C
                        </button>
                        <button
                            onClick={() => onTextStyleChange?.({ textAlign: "right" })}
                            aria-pressed={textStyle.textAlign === "right"}
                            className={`flex-1 py-1 text-xs rounded border transition-all ${
                                textStyle.textAlign === "right"
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background border-border hover:bg-secondary"
                            }`}
                        >
                            R
                        </button>
                    </div>
                </>
            )}
        </>
    );

    if (docked) {
        return (
            <div
                role="complementary"
                aria-label="Shape properties"
                className="hidden md:block fixed top-16 left-[3.25rem] z-40 w-60 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-lg border border-border bg-card/95 backdrop-blur-md shadow-xl animate-[popover-in_150ms_ease-out]"
            >
                {content}
            </div>
        );
    }

    return (
        <PopoverPanel
            onClose={onClose ?? (() => {})}
            role="dialog"
            className="left-3 top-16 right-3 max-h-[45vh] overflow-y-auto md:hidden"
        >
            {content}
        </PopoverPanel>
    );
}
