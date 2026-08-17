import { useState } from "react";
import { ShapeStyle } from "@repo/shapes";
import { ArrowDown, ArrowUp, BringToFront, SendToBack, X } from "lucide-react";
import { PopoverPanel } from "./PopoverPanel";
import { ShapeStyleSection, StyleSections } from "./ShapeStyleSection";
import { IconButton } from "./IconButton";
import { Slider, SectionLabel } from "./ui";
import { Tooltip } from "./Tooltip";
import { Game } from "../draw/Game";

/** Human-readable labels for each shape type shown in the panel header */
const LABELS: Record<string, string> = {
    rect: "Rectangle",
    circle: "Circle",
    diamond: "Diamond",
    arrow: "Arrow",
    line: "Line",
    text: "Text",
    pencil: "Pen",
    frame: "Frame",
};

/** Which pen sections each tool/selection needs (missing keys = hidden) */
const TOOL_SECTIONS: Record<string, StyleSections> = {
    rect: {},
    circle: {},
    diamond: {},
    frame: { fill: false, fillStyle: false },
    line: { fill: false, fillStyle: false },
    arrow: { fill: false, fillStyle: false },
    pencil: { fill: false, fillStyle: false },
    pen: { fill: false, fillStyle: false },
    text: { thickness: false, roughness: false, opacity: false, fill: false, fillStyle: false },
    stickyNote: { thickness: false, roughness: false, fill: false, fillStyle: false },
    image: { stroke: false, fill: false, fillStyle: false, thickness: false, roughness: false },
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
                <SectionLabel className="mb-0">{LABELS[shapeType] ?? shapeType}</SectionLabel>
                <button
                    type="button"
                    onClick={() => setHidden(true)}
                    aria-label="Close properties"
                    className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground dark:text-muted-foreground-dark transition-[color,background-color] duration-fast cursor-pointer active:bg-active dark:active:bg-active-dark hover:bg-hover dark:hover:bg-hover-dark hover:text-foreground dark:hover:text-foreground-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                    <X size={14} />
                </button>
            </div>

            {isSelection && game && (
                <div className="flex items-center px-2 py-1 mb-1">
                    <Tooltip label="Send to back" side="top">
                        <IconButton icon={<SendToBack size={14} />} onClick={() => game.sendToBack()} activated={false} label="Send to back" />
                    </Tooltip>
                    <Tooltip label="Send backward" side="top">
                        <IconButton icon={<ArrowDown size={14} />} onClick={() => game.sendBackward()} activated={false} label="Send backward" />
                    </Tooltip>
                    <Tooltip label="Bring forward" side="top">
                        <IconButton icon={<ArrowUp size={14} />} onClick={() => game.bringForward()} activated={false} label="Bring forward" />
                    </Tooltip>
                    <Tooltip label="Bring to front" side="top">
                        <IconButton icon={<BringToFront size={14} />} onClick={() => game.bringToFront()} activated={false} label="Bring to front" />
                    </Tooltip>
                </div>
            )}

            {shapeType === "frame" && onFrameNameChange && (
                <div className="px-3 mb-3">
                    <SectionLabel>Frame Name</SectionLabel>
                    <input
                        type="text"
                        value={frameName ?? ""}
                        onChange={(e) => onFrameNameChange(e.target.value)}
                        className="w-full bg-muted dark:bg-muted-dark border border-border dark:border-border-dark rounded-md px-2 py-1 text-xs text-foreground dark:text-foreground-dark focus:outline-none focus:ring-1 focus:ring-primary"
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
                isDark={game?.isDark}
            />

            {shapeType === "arrow" && onArrowHeadSizeChange && arrowHeadSize !== undefined && (
                <Slider
                    label="Arrowhead"
                    valueText={String(arrowHeadSize)}
                    min={4}
                    max={30}
                    step={1}
                    value={arrowHeadSize}
                    onChange={(v) => onArrowHeadSizeChange(v)}
                />
            )}

            {shapeType === "text" && textStyle && onTextStyleChange && (
                <>
                    <div className="px-3 mb-2">
                        <SectionLabel>Font</SectionLabel>
                        <select
                            value={textStyle.fontFamily || "Arial"}
                            onChange={(e) => onTextStyleChange({ fontFamily: e.target.value })}
                            className="w-full bg-muted dark:bg-muted-dark border border-border dark:border-border-dark rounded-md px-2 py-1 text-xs text-foreground dark:text-foreground-dark focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            {FONTS.map((f) => (
                                <option key={f} value={f}>{f}</option>
                            ))}
                        </select>
                    </div>
                    <Slider
                        label="Font Size"
                        valueText={`${textStyle.fontSize || 20}px`}
                        min={10}
                        max={72}
                        step={2}
                        value={textStyle.fontSize || 20}
                        onChange={(v) => onTextStyleChange({ fontSize: v })}
                    />
                    <div className="flex gap-2 px-3 mb-2">
                        <button
                            onClick={() => onTextStyleChange?.({ bold: !textStyle.bold })}
                            aria-pressed={Boolean(textStyle.bold)}
                            className={`flex-1 py-1 text-xs font-medium rounded-md border transition-[color,background-color,transform,border-color] duration-fast cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none ${
                                textStyle.bold
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-muted dark:bg-muted-dark border-border dark:border-border-dark hover:bg-hover dark:hover:bg-hover-dark active:bg-active dark:active:bg-active-dark"
                            }`}
                        >
                            B
                        </button>
                        <button
                            onClick={() => onTextStyleChange?.({ italic: !textStyle.italic })}
                            aria-pressed={Boolean(textStyle.italic)}
                            className={`flex-1 py-1 text-xs font-medium rounded-md border transition-[color,background-color,transform,border-color] duration-fast italic cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none ${
                                textStyle.italic
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-muted dark:bg-muted-dark border-border dark:border-border-dark hover:bg-hover dark:hover:bg-hover-dark active:bg-active dark:active:bg-active-dark"
                            }`}
                        >
                            I
                        </button>
                    </div>
                    <div className="flex gap-2 px-3 mb-3">
                        <button
                            onClick={() => onTextStyleChange?.({ textAlign: "left" })}
                            aria-pressed={textStyle.textAlign === "left" || (!textStyle.textAlign)}
                            className={`flex-1 py-1 text-xs font-medium rounded-md border transition-[color,background-color,transform,border-color] duration-fast cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none ${
                                !textStyle.textAlign || textStyle.textAlign === "left"
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-muted dark:bg-muted-dark border-border dark:border-border-dark hover:bg-hover dark:hover:bg-hover-dark active:bg-active dark:active:bg-active-dark"
                            }`}
                        >
                            L
                        </button>
                        <button
                            onClick={() => onTextStyleChange?.({ textAlign: "center" })}
                            aria-pressed={textStyle.textAlign === "center"}
                            className={`flex-1 py-1 text-xs font-medium rounded-md border transition-[color,background-color,transform,border-color] duration-fast cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none ${
                                textStyle.textAlign === "center"
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-muted dark:bg-muted-dark border-border dark:border-border-dark hover:bg-hover dark:hover:bg-hover-dark active:bg-active dark:active:bg-active-dark"
                            }`}
                        >
                            C
                        </button>
                        <button
                            onClick={() => onTextStyleChange?.({ textAlign: "right" })}
                            aria-pressed={textStyle.textAlign === "right"}
                            className={`flex-1 py-1 text-xs font-medium rounded-md border transition-[color,background-color,transform,border-color] duration-fast cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none ${
                                textStyle.textAlign === "right"
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-muted dark:bg-muted-dark border-border dark:border-border-dark hover:bg-hover dark:hover:bg-hover-dark active:bg-active dark:active:bg-active-dark"
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
