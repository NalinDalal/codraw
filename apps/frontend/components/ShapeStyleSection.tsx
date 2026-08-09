/**
 * Shared pen / style section used by the properties panel.
 *
 * Extracted so the same style controls (stroke, background, thickness,
 * roughness, opacity, web link) apply to any selected shape — and the
 * values act as the default pen style for newly drawn shapes.
 */

import { ShapeStyle } from "@repo/shapes";

/** Which pen sections a tool/selection needs; defaults to everything on */
export interface StyleSections {
    stroke?: boolean;
    fill?: boolean;
    thickness?: boolean;
    roughness?: boolean;
    opacity?: boolean;
    webLink?: boolean;
}

/** Predefined color palette for stroke and background swatches. */
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

/** A single color circle in the palette. Shows a checkerboard for "transparent". */
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

/** A labeled slider row. */
function SliderRow({
    label,
    valueText,
    min,
    max,
    step,
    value,
    onChange,
}: {
    label: string;
    valueText: string;
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (value: number) => void;
}) {
    return (
        <div className="px-3 mb-2">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{label}</span>
                <span>{valueText}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full accent-primary"
            />
        </div>
    );
}

export function ShapeStyleSection({
    style,
    onStyleChange,
    url,
    onUrlChange,
    sections,
}: {
    style: ShapeStyle;
    onStyleChange: (updates: Partial<ShapeStyle>) => void;
    url?: string;
    onUrlChange?: (url: string) => void;
    sections?: StyleSections;
}) {
    const show = (s: keyof StyleSections) => sections?.[s] ?? true;
    return (
        <>
            {show("stroke") && (
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
                    <div className="mt-1.5">
                        <label className="flex items-center gap-2 text-[10px] text-muted-foreground cursor-pointer">
                            <input
                                type="color"
                                value={style.strokeColor === "transparent" ? "#000000" : style.strokeColor}
                                onChange={(e) => onStyleChange({ strokeColor: e.target.value })}
                                className="w-4 h-4 rounded cursor-pointer border border-border bg-transparent p-0"
                                aria-label="More stroke colors"
                            />
                            More colors
                        </label>
                    </div>
                </div>
            )}

            {show("fill") && (
                <div className="px-3 mb-3">
                    <div className="text-xs text-muted-foreground mb-1.5">Fill</div>
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
                    <div className="mt-1.5">
                        <label className="flex items-center gap-2 text-[10px] text-muted-foreground cursor-pointer">
                            <input
                                type="color"
                                value={style.backgroundColor === "transparent" ? "#ffffff" : style.backgroundColor}
                                onChange={(e) => onStyleChange({ backgroundColor: e.target.value })}
                                className="w-4 h-4 rounded cursor-pointer border border-border bg-transparent p-0"
                                aria-label="More fill colors"
                            />
                            More colors
                        </label>
                    </div>
                </div>
            )}

            {show("thickness") && (
                <SliderRow
                    label="Thickness"
                    valueText={style.strokeWidth.toFixed(1)}
                    min={0.5}
                    max={8}
                    step={0.5}
                    value={style.strokeWidth}
                    onChange={(v) => onStyleChange({ strokeWidth: v })}
                />
            )}

            {show("roughness") && (
                <SliderRow
                    label="Roughness"
                    valueText={style.roughness.toFixed(1)}
                    min={0}
                    max={5}
                    step={0.5}
                    value={style.roughness}
                    onChange={(v) => onStyleChange({ roughness: v })}
                />
            )}

            {show("opacity") && (
                <SliderRow
                    label="Opacity"
                    valueText={`${Math.round(style.opacity * 100)}%`}
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={style.opacity}
                    onChange={(v) => onStyleChange({ opacity: v })}
                />
            )}

            {show("webLink") && onUrlChange && (
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
        </>
    );
}
