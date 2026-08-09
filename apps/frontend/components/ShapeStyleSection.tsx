/**
 * Shared pen / style section used by the properties panel.
 *
 * Extracted so the same style controls (stroke, background, thickness,
 * roughness, opacity, web link) apply to any selected shape — and the
 * values act as the default pen style for newly drawn shapes.
 */

import { ShapeStyle } from "@repo/shapes";

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
}: {
    style: ShapeStyle;
    onStyleChange: (updates: Partial<ShapeStyle>) => void;
    url?: string;
    onUrlChange?: (url: string) => void;
}) {
    return (
        <>
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

            <SliderRow
                label="Thickness"
                valueText={style.strokeWidth.toFixed(1)}
                min={0.5}
                max={8}
                step={0.5}
                value={style.strokeWidth}
                onChange={(v) => onStyleChange({ strokeWidth: v })}
            />

            <SliderRow
                label="Roughness"
                valueText={style.roughness.toFixed(1)}
                min={0}
                max={5}
                step={0.5}
                value={style.roughness}
                onChange={(v) => onStyleChange({ roughness: v })}
            />

            <SliderRow
                label="Opacity"
                valueText={`${Math.round(style.opacity * 100)}%`}
                min={0.1}
                max={1}
                step={0.05}
                value={style.opacity}
                onChange={(v) => onStyleChange({ opacity: v })}
            />

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
        </>
    );
}
