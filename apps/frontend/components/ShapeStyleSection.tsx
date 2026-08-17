/**
 * Shared pen / style section used by the properties panel.
 *
 * Extracted so the same style controls (stroke, background, thickness,
 * opacity, web link) apply to any selected shape — and the values act
 * as the default pen style for newly drawn shapes.
 */

import { ShapeStyle, FillStyle, resolveStrokeColor } from "@repo/shapes";
import { Slider, ColorSwatch, SectionLabel, Input } from "./ui";

/** Which pen sections a tool/selection needs; defaults to everything on */
export interface StyleSections {
    stroke?: boolean;
    fill?: boolean;
    fillStyle?: boolean;
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

const FILL_STYLES: { id: FillStyle; label: string; icon: React.ReactNode }[] = [
    {
        id: "solid",
        label: "Solid",
        icon: (
            <svg width="14" height="14" viewBox="0 0 14 14">
                <rect x="1.5" y="1.5" width="11" height="11" fill="currentColor" />
            </svg>
        ),
    },
    {
        id: "hachure",
        label: "Hachure",
        icon: (
            <svg width="14" height="14" viewBox="0 0 14 14">
                <rect x="1.5" y="1.5" width="11" height="11" fill="none" stroke="currentColor" />
                <line x1="2" y1="12" x2="12" y2="2" stroke="currentColor" />
                <line x1="6" y1="12" x2="12" y2="6" stroke="currentColor" />
                <line x1="2" y1="8" x2="8" y2="2" stroke="currentColor" />
            </svg>
        ),
    },
    {
        id: "cross-hatch",
        label: "Cross-hatch",
        icon: (
            <svg width="14" height="14" viewBox="0 0 14 14">
                <rect x="1.5" y="1.5" width="11" height="11" fill="none" stroke="currentColor" />
                <line x1="2" y1="12" x2="12" y2="2" stroke="currentColor" />
                <line x1="6" y1="12" x2="12" y2="6" stroke="currentColor" />
                <line x1="2" y1="8" x2="8" y2="2" stroke="currentColor" />
                <line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" />
                <line x1="2" y1="6" x2="6" y2="2" stroke="currentColor" />
                <line x1="8" y1="12" x2="12" y2="8" stroke="currentColor" />
            </svg>
        ),
    },
];

export function ShapeStyleSection({
    style,
    onStyleChange,
    url,
    urlMixed,
    onUrlChange,
    sections,
    isDark,
}: {
    /**
     * Consensus style across the selection. Properties left `undefined`
     * mean the selected shapes disagree ("mixed"); every control renders
     * a neutral state and applying a value sets it on all selected shapes.
     */
    style: Partial<ShapeStyle>;
    onStyleChange: (updates: Partial<ShapeStyle>) => void;
    url?: string;
    urlMixed?: boolean;
    onUrlChange?: (url: string) => void;
    sections?: StyleSections;
    isDark?: boolean;
}) {
    const show = (s: keyof StyleSections) => sections?.[s] ?? true;
    const resolvedStroke = isDark !== undefined ? resolveStrokeColor(style as ShapeStyle, isDark) : style.strokeColor;
    const { backgroundColor, strokeWidth, opacity, fillStyle } = style;
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
                                selected={resolvedStroke === c}
                                onClick={() => onStyleChange({ strokeColor: c })}
                                label={`Stroke ${c}`}
                            />
                        ))}
                    </div>
                    <div className="mt-1.5">
                        <label className="flex items-center gap-2 text-10 text-muted-foreground dark:text-muted-foreground-dark cursor-pointer">
                            <input
                                type="color"
                                value={resolvedStroke === "transparent" || resolvedStroke === undefined ? "#000000" : resolvedStroke}
                                onChange={(e) => onStyleChange({ strokeColor: e.target.value })}
                                className="w-4 h-4 rounded cursor-pointer border border-border dark:border-border-dark bg-transparent p-0"
                                aria-label="More stroke colors"
                            />
                            More colors
                        </label>
                    </div>
                </div>
            )}

            {show("fillStyle") && (
                <div className="px-3 mb-3">
                    <SectionLabel>Fill Style</SectionLabel>
                    <div className="flex gap-1.5">
                        {FILL_STYLES.map((fs) => (
                            <button
                                key={fs.id}
                                type="button"
                                aria-pressed={fillStyle === fs.id}
                                aria-label={`Fill style: ${fs.label}`}
                                title={fs.label}
                                onClick={() => onStyleChange({ fillStyle: fs.id })}
                                className={`flex-1 flex items-center justify-center py-1.5 rounded-md border transition-[color,background-color,border-color,transform] duration-fast cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none ${
                                    fillStyle === fs.id
                                        ? "bg-selected dark:bg-selected-dark border-highlight dark:border-highlight-dark text-highlight dark:text-highlight-dark"
                                        : "bg-muted dark:bg-muted-dark border-border dark:border-border-dark text-text-secondary dark:text-text-secondary-dark hover:bg-hover dark:hover:bg-hover-dark active:bg-active dark:active:bg-active-dark"
                                }`}
                            >
                                {fs.icon}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {show("fill") && (
                <div className="px-3 mb-3">
                    <SectionLabel>Background</SectionLabel>
                    <div className="grid grid-cols-6 gap-1.5">
                        <ColorSwatch
                            color="transparent"
                            selected={backgroundColor === "transparent"}
                            onClick={() => onStyleChange({ backgroundColor: "transparent" })}
                            label="No fill"
                        />
                        {COLORS.map((c) => (
                            <ColorSwatch
                                key={c}
                                color={c}
                                selected={backgroundColor === c}
                                onClick={() => onStyleChange({ backgroundColor: c })}
                                label={`Fill ${c}`}
                            />
                        ))}
                    </div>
                    <div className="mt-1.5">
                        <label className="flex items-center gap-2 text-10 text-muted-foreground dark:text-muted-foreground-dark cursor-pointer">
                            <input
                                type="color"
                                value={backgroundColor === "transparent" || backgroundColor === undefined ? "#ffffff" : backgroundColor}
                                onChange={(e) => onStyleChange({ backgroundColor: e.target.value })}
                                className="w-4 h-4 rounded cursor-pointer border border-border dark:border-border-dark bg-transparent p-0"
                                aria-label="More background colors"
                            />
                            More colors
                        </label>
                    </div>
                </div>
            )}

            {show("thickness") && (
                <Slider
                    label="Thickness"
                    valueText={strokeWidth !== undefined ? strokeWidth.toFixed(1) : "—"}
                    min={0.5}
                    max={8}
                    step={0.5}
                    value={strokeWidth ?? 1}
                    onChange={(v) => onStyleChange({ strokeWidth: v })}
                />
            )}

            {show("opacity") && (
                <Slider
                    label="Opacity"
                    valueText={opacity !== undefined ? `${Math.round(opacity * 100)}%` : "—"}
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={opacity ?? 1}
                    onChange={(v) => onStyleChange({ opacity: v })}
                />
            )}

            {show("webLink") && onUrlChange && (
                <div className="px-3 mb-3">
                    <SectionLabel>Web Link</SectionLabel>
                    <Input
                        value={url ?? ""}
                        onChange={onUrlChange}
                        placeholder={urlMixed ? "Multiple values" : "https://example.com"}
                    />
                    {url && (
                        <button
                            onClick={() => onUrlChange("")}
                            className="mt-1.5 text-11 text-danger dark:text-danger-dark transition-[color,background-color] duration-fast cursor-pointer active:bg-active dark:active:bg-active-dark hover:bg-danger/10 dark:hover:bg-danger-dark/10 px-1.5 py-0.5 -ml-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/50"
                        >
                            Remove link
                        </button>
                    )}
                </div>
            )}
        </>
    );
}
