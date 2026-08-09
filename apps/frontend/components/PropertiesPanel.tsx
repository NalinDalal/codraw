import { useState } from "react";
import { ShapeStyle } from "@repo/shapes";
import { ArrowDown, ArrowUp, BringToFront, SendToBack, X } from "lucide-react";
import { PopoverPanel } from "./PopoverPanel";
import { ShapeStyleSection, StyleSections } from "./ShapeStyleSection";
import { IconButton } from "./IconButton";
import { Game } from "../draw/Game";

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

/** Which pen sections each tool/selection needs (missing keys = hidden) */
const TOOL_SECTIONS: Record<string, StyleSections> = {
    rect: {},
    circle: {},
    diamond: {},
    frame: {},
    line: { fill: false },
    arrow: { fill: false },
    pencil: { fill: false },
    constantPen: { fill: false },
    text: { thickness: false, roughness: false, opacity: false },
    stickyNote: { thickness: false, roughness: false },
    image: { stroke: false, fill: false, thickness: false, roughness: false },
};

/**
 * Properties panel for the active tool or the selected shape.
 *
 * The shared pen section (stroke, background, thickness, roughness,
 * opacity, web link) comes from {@link ShapeStyleSection}; this panel
 * adds the type-specific controls around it, gated per tool via
 * {@link TOOL_SECTIONS}, plus layer actions when a shape is selected.
 *
 * It appears only while a tool or shape needs it, can be dismissed with
 * the close button, outside click, or Escape, and reopens automatically
 * when the tool or selection changes (the parent remounts it via `key`).
 * On small screens it renders as a bottom sheet above the tool dock.
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
    isSelection,
    game,
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
    isSelection?: boolean;
    game?: Game;
}) {
    const [hidden, setHidden] = useState(false);
    if (hidden) return null;

    const FONTS = ["Arial", "Georgia", "Courier New", "Times New Roman", "Verdana", "Impact"];
    const sections = TOOL_SECTIONS[shapeType] ?? {};
    const content = (
        <>
            <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {LABELS[shapeType] ?? shapeType}
                </span>
                <button
                    type="button"
                    onClick={() => setHidden(true)}
                    aria-label="Close properties"
                    className="p-0.5 rounded text-muted-foreground transition-colors duration-100 hover:bg-secondary hover:text-foreground"
                >
                    <X size={13} />
                </button>
            </div>

            {isSelection && game && (
                <div className="flex items-center px-2 py-1 mb-1 border-b border-border">
                    <IconButton
                        icon={<SendToBack size={14} />}
                        onClick={() => game.sendToBack()}
                        activated={false}
                        title="Send to back"
                    />
                    <IconButton
                        icon={<ArrowDown size={14} />}
                        onClick={() => game.sendBackward()}
                        activated={false}
                        title="Send backward"
                    />
                    <IconButton
                        icon={<ArrowUp size={14} />}
                        onClick={() => game.bringForward()}
                        activated={false}
                        title="Bring forward"
                    />
                    <IconButton
                        icon={<BringToFront size={14} />}
                        onClick={() => game.bringToFront()}
                        activated={false}
                        title="Bring to front"
                    />
                </div>
            )}

            {shapeType === "frame" && onFrameNameChange && (
                <div className="px-3 mb-3">
                    <div className="text-xs text-muted-foreground mb-1.5">Frame Name</div>
                    <input
                        type="text"
                        value={frameName ?? ""}
                        onChange={(e) => onFrameNameChange(e.target.value)}
                        className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Frame name"
                    />
                </div>
            )}

            <ShapeStyleSection
                style={style}
                onStyleChange={onStyleChange}
                url={url}
                onUrlChange={onUrlChange}
                sections={sections}
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
                            className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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
                                    : "bg-secondary border-border hover:bg-surface-hover"
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
                                    : "bg-secondary border-border hover:bg-surface-hover"
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
                                    : "bg-secondary border-border hover:bg-surface-hover"
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
                                    : "bg-secondary border-border hover:bg-surface-hover"
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
                                    : "bg-secondary border-border hover:bg-surface-hover"
                            }`}
                        >
                            R
                        </button>
                    </div>
                </>
            )}
        </>
    );

    return (
        <PopoverPanel
            onClose={() => setHidden(true)}
            role="dialog"
            className={`max-h-[45vh] overflow-y-auto ${docked ? "hidden lg:block top-24 left-3 w-60 max-h-[calc(100vh-7rem)]" : "left-3 top-16 right-3 lg:hidden"}`}
        >
            {content}
        </PopoverPanel>
    );
}
