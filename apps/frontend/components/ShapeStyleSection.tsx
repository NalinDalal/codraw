/**
 * Shared pen / style section used by the properties panel.
 *
 * Extracted so the same style controls (stroke, background, thickness,
 * opacity, web link) apply to any selected shape — and the values act
 * as the default pen style for newly drawn shapes.
 */

import { ShapeStyle } from "@repo/shapes";
import { Slider, ColorSwatch, SectionLabel, Input } from "./ui";

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
                    <SectionLabel>Stroke</SectionLabel>
                    <div className="grid grid-cols-6 gap-1.5">
                        {COLORS.map((c) => (
                            <ColorSwatch
                                key={c}
                                color={c}
                                selected={style.strokeColor === c}
                                onClick={() => onStyleChange({ strokeColor: c })}
                                label={`Stroke ${c}`}
                            />
                        ))}
                    </div>
                    <div className="mt-1.5">
                        <label className="flex items-center gap-2 text-[10px] text-muted-foreground dark:text-muted-foreground-dark cursor-pointer">
                            <input
                                type="color"
                                value={style.strokeColor === "transparent" ? "#000000" : style.strokeColor}
                                onChange={(e) => onStyleChange({ strokeColor: e.target.value })}
                                className="w-4 h-4 rounded cursor-pointer border border-border dark:border-border-dark bg-transparent p-0"
                                aria-label="More stroke colors"
                            />
                            More colors
                        </label>
                    </div>
                </div>
            )}

            {show("fill") && (
                <div className="px-3 mb-3">
                    <SectionLabel>Fill</SectionLabel>
                    <div className="grid grid-cols-6 gap-1.5">
                        <ColorSwatch
                            color="transparent"
                            selected={style.backgroundColor === "transparent"}
                            onClick={() => onStyleChange({ backgroundColor: "transparent" })}
                            label="No fill"
                        />
                        {COLORS.map((c) => (
                            <ColorSwatch
                                key={c}
                                color={c}
                                selected={style.backgroundColor === c}
                                onClick={() => onStyleChange({ backgroundColor: c })}
                                label={`Fill ${c}`}
                            />
                        ))}
                    </div>
                    <div className="mt-1.5">
                        <label className="flex items-center gap-2 text-[10px] text-muted-foreground dark:text-muted-foreground-dark cursor-pointer">
                            <input
                                type="color"
                                value={style.backgroundColor === "transparent" ? "#ffffff" : style.backgroundColor}
                                onChange={(e) => onStyleChange({ backgroundColor: e.target.value })}
                                className="w-4 h-4 rounded cursor-pointer border border-border dark:border-border-dark bg-transparent p-0"
                                aria-label="More fill colors"
                            />
                            More colors
                        </label>
                    </div>
                </div>
            )}

            {show("thickness") && (
                <Slider
                    label="Thickness"
                    valueText={style.strokeWidth.toFixed(1)}
                    min={0.5}
                    max={8}
                    step={0.5}
                    value={style.strokeWidth}
                    onChange={(v) => onStyleChange({ strokeWidth: v })}
                />
            )}

            {show("opacity") && (
                <Slider
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
                    <SectionLabel>Web Link</SectionLabel>
                    <Input
                        value={url ?? ""}
                        onChange={onUrlChange}
                        placeholder="https://example.com"
                    />
                    {url && (
                        <button
                            onClick={() => onUrlChange("")}
                            className="mt-1.5 text-[11px] text-red-400 hover:text-red-300 transition-colors duration-fast"
                        >
                            Remove link
                        </button>
                    )}
                </div>
            )}
        </>
    );
}
