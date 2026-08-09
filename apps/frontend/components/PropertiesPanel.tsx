import { ShapeStyle } from "@repo/shapes";
import { X } from "lucide-react";
import { PopoverPanel } from "./PopoverPanel";

/**
 * Predefined color palette for stroke and background swatches.
 * Includes neutrals, warm, and cool tones plus transparent.
 */
const COLORS = [
    "#000000",
    "#1e1e1e",
    "#495057",
    "#868e96",
    "#ffffff",
    "#ff6b6b",
    "#ffa94d",
    "#ffd43b",
    "#69db7c",
    "#4dabf7",
    "#9775fa",
    "#f783ac",
];

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
 * A single color circle in the palette.
 * Shows a checkerboard pattern for "transparent".
 */
function Swatch({
    color,
    selected,
    onClick,
}: {
    color: string;
    selected: boolean;
    onClick: () => void;
}) {
    const isTransparent = color === "transparent";
    return (
        <button
            onClick={onClick}
            aria-label={`Color ${color}`}
            className={`w-5 h-5 rounded-full border transition-all ${selected
                ? "border-primary scale-110 ring-1 ring-primary"
                : "border-border hover:border-foreground/60"
                }`}
            style={{
                background: isTransparent
                    ? "repeating-conic-gradient(var(--muted-foreground) 0% 25%, transparent 0% 50%) 50% / 8px 8px"
                    : color,
            }}
        />
    );
}

/**
 * Contextual properties panel — shown only when the active tool or the
 * selected shape has configurable properties.
 *
 * Displays (per shape type):
 *   - Stroke color swatches
 *   - Background color swatches
 *   - Thickness slider
 *   - Arrowhead size slider (only for arrows)
 *   - Roughness slider
 *   - Opacity slider
 *   - Web link field (when supported)
 *   - Frame name field (frames only)
 *   - Font / size / bold / italic / alignment (text only)
 *
 * On desktop it appears as a compact popover beside the tool rail; on
 * small screens it renders as a bottom sheet above the tool dock.
 * Dismisses on outside click, Escape, or the close button.
 */
export function PropertiesPanel({
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
    onClose: () => void;
}) {
    const FONTS = ["Arial", "Georgia", "Courier New", "Times New Roman", "Verdana", "Impact"];
    return (
        <PopoverPanel
            onClose={onClose}
            role="dialog"
            className="left-3 top-16 right-3 max-h-[45vh] overflow-y-auto md:left-[3.25rem] md:right-auto md:top-16 md:w-60 md:max-h-none"
        >
            <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {LABELS[shapeType] ?? shapeType}
                </span>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close properties"
                    className="p-0.5 rounded text-muted-foreground transition-colors duration-100 hover:bg-secondary hover:text-foreground"
                >
                    <X size={13} />
                </button>
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

            <div className="px-3 mb-3">
                <div className="text-xs text-muted-foreground mb-1.5">Stroke</div>
                <div className="grid grid-cols-6 gap-1.5">
                    {COLORS.map((c) => (
                        <Swatch
                            key={c}
                            color={c}
                            selected={style.strokeColor === c}
                            onClick={() => onStyleChange({ strokeColor: c })}
                        />
                    ))}
                </div>
            </div>

            <div className="px-3 mb-3">
                <div className="text-xs text-muted-foreground mb-1.5">Background</div>
                <div className="grid grid-cols-6 gap-1.5">
                    <Swatch
                        color="transparent"
                        selected={style.backgroundColor === "transparent"}
                        onClick={() => onStyleChange({ backgroundColor: "transparent" })}
                    />
                    {COLORS.map((c) => (
                        <Swatch
                            key={c}
                            color={c}
                            selected={style.backgroundColor === c}
                            onClick={() => onStyleChange({ backgroundColor: c })}
                        />
                    ))}
                </div>
            </div>

            <div className="px-3 mb-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Thickness</span>
                    <span>{style.strokeWidth.toFixed(1)}</span>
                </div>
                <input
                    type="range"
                    min="0.5"
                    max="8"
                    step="0.5"
                    value={style.strokeWidth}
                    onChange={(e) =>
                        onStyleChange({ strokeWidth: parseFloat(e.target.value) })
                    }
                    className="w-full accent-primary"
                />
            </div>

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

            <div className="px-3 mb-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Roughness</span>
                    <span>{style.roughness.toFixed(1)}</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.5"
                    value={style.roughness}
                    onChange={(e) =>
                        onStyleChange({ roughness: parseFloat(e.target.value) })
                    }
                    className="w-full accent-primary"
                />
            </div>

            <div className="px-3 mb-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Opacity</span>
                    <span>{Math.round(style.opacity * 100)}%</span>
                </div>
                <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={style.opacity}
                    onChange={(e) =>
                        onStyleChange({ opacity: parseFloat(e.target.value) })
                    }
                    className="w-full accent-primary"
                />
            </div>

            {onUrlChange && (
                <div className="px-3 mb-3">
                    <div className="text-xs text-muted-foreground mb-1.5">Web Link</div>
                    <input
                        type="url"
                        placeholder="https://example.com"
                        value={url ?? ""}
                        onChange={(e) => onUrlChange(e.target.value)}
                        className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {url && (
                        <button
                            onClick={() => onUrlChange("")}
                            className="mt-1 text-xs text-red-400 hover:text-red-300"
                        >
                            Remove link
                        </button>
                    )}
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
        </PopoverPanel>
    );
}
