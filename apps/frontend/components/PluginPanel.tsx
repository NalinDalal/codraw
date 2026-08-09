/**
 * Plugin panel for managing loaded plugins and custom tools.
 *
 * Features:
 * - View loaded plugins
 * - Load/unload plugins
 * - Activate plugin tools
 */

import { useState, useRef } from "react";
import { Game } from "@/draw/Game";
import { Plugin, CustomToolDefinition } from "@/draw/pluginSystem";

/**
 * PluginPanel — floating panel for managing plugins.
 *
 * @param game - The Game engine instance
 * @param open - Whether the panel is visible
 * @param onClose - Callback to close the panel
 */
export function PluginPanel({
    game,
    open,
    onClose,
}: {
    game: Game | undefined;
    open: boolean;
    onClose: () => void;
}) {
    const [plugins, setPlugins] = useState<Plugin[]>([]);
    const [pluginName, setPluginName] = useState("");
    const [pluginCode, setPluginCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const refresh = () => setPlugins(game?.getLoadedPlugins() ?? []);

    if (!open) return null;

    const handleLoadPlugin = () => {
        if (!pluginName.trim() || !pluginCode.trim()) {
            setError("Plugin name and code are required");
            return;
        }
        try {
            const plugin = createPluginFromCode(pluginName.trim(), pluginCode.trim());
            if (game?.loadPlugin(plugin)) {
                setPluginName("");
                setPluginCode("");
                setError(null);
                refresh();
            } else {
                setError("Failed to load plugin (may already be loaded)");
            }
        } catch (e) {
            setError(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
        }
    };

    const handleUnloadPlugin = (pluginId: string) => {
        game?.unloadPlugin(pluginId);
        refresh();
    };

    const handleActivateTool = (toolId: string) => {
        game?.setTool(toolId);
    };

    const handleImportPlugin = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const json = reader.result as string;
                const plugin = JSON.parse(json) as Plugin;
                if (game?.loadPlugin(plugin)) {
                    refresh();
                } else {
                    setError("Failed to load plugin");
                }
            } catch (err) {
                setError(`Invalid plugin file: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    const handleExportPlugin = (plugin: Plugin) => {
        const json = JSON.stringify(plugin, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${plugin.name.replace(/\s+/g, "_").toLowerCase()}.plugin.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed right-4 top-14 w-80 bg-card/95 backdrop-blur-md rounded-xl border border-border p-4 text-foreground select-none z-20 max-h-[80vh] overflow-y-auto shadow-soft animate-[popover-in_150ms_ease-out]">
            <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Plugins</div>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm cursor-pointer">✕</button>
            </div>

            {/* Load plugin from code */}
            <div className="mb-3">
                <div className="text-xs text-muted-foreground mb-1">Load Plugin from Code</div>
                <input
                    type="text"
                    value={pluginName}
                    onChange={e => setPluginName(e.target.value)}
                    placeholder="Plugin name..."
                    className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground mb-1 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <textarea
                    value={pluginCode}
                    onChange={e => setPluginCode(e.target.value)}
                    placeholder={`{\n  "id": "my-plugin",\n  "name": "My Plugin",\n  "version": "1.0.0",\n  "tools": [...]\n}`}
                    className="w-full h-24 bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                    onClick={handleLoadPlugin}
                    className="w-full mt-1 px-2 py-1 bg-primary hover:bg-accent-hover rounded text-xs cursor-pointer text-primary-foreground"
                >
                    Load Plugin
                </button>
            </div>

            {/* Import/Export */}
            <div className="flex gap-1 mb-3">
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 px-2 py-1 bg-secondary hover:bg-surface-hover border border-border rounded text-xs cursor-pointer"
                >
                    Import JSON
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleImportPlugin}
                    className="hidden"
                />
            </div>

            {error && (
                <div className="mb-3 p-2 bg-red-500/20 border border-red-500/40 rounded text-xs text-red-300">
                    {error}
                </div>
            )}

            {/* Plugin list */}
            <div className="space-y-2">
                {plugins.length === 0 && (
                    <div className="text-xs text-muted-foreground/60 text-center py-2">No plugins loaded</div>
                )}
                {plugins.map(plugin => (
                    <div key={plugin.id} className="bg-secondary rounded p-2">
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-xs font-medium">{plugin.name}</div>
                            <div className="text-[10px] text-muted-foreground">v{plugin.version}</div>
                        </div>
                        <div className="text-[10px] text-muted-foreground mb-2">{plugin.id}</div>

                        {/* Plugin tools */}
                        {plugin.tools && plugin.tools.length > 0 && (
                            <div className="mb-2">
                                <div className="text-[10px] text-muted-foreground mb-1">Tools:</div>
                                <div className="flex flex-wrap gap-1">
                                    {plugin.tools.map(tool => (
                                        <button
                                            key={tool.id}
                                            onClick={() => handleActivateTool(tool.id)}
                                            className="px-2 py-0.5 bg-primary/20 hover:bg-primary/40 border border-primary/30 rounded text-[10px] cursor-pointer"
                                            title={tool.name}
                                        >
                                            {tool.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-1">
                            <button
                                onClick={() => handleExportPlugin(plugin)}
                                className="flex-1 px-1 py-0.5 bg-secondary hover:bg-surface-hover rounded text-[10px] cursor-pointer"
                            >
                                Export
                            </button>
                            <button
                                onClick={() => handleUnloadPlugin(plugin.id)}
                                className="flex-1 px-1 py-0.5 bg-red-500/20 hover:bg-red-500/40 rounded text-[10px] cursor-pointer"
                            >
                                Unload
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Demo plugins */}
            <div className="mt-3 pt-3 border-t border-border-subtle">
                <div className="text-xs text-muted-foreground mb-2">Demo Plugins</div>
                <div className="space-y-1">
                    <button
                        onClick={() => {
                            const plugin = createSprayPaintPlugin();
                            game?.loadPlugin(plugin);
                            refresh();
                        }}
                        className="w-full px-2 py-1 bg-secondary hover:bg-surface-hover border border-border rounded text-xs text-left cursor-pointer"
                    >
                        🎨 Spray Paint
                    </button>
                    <button
                        onClick={() => {
                            const plugin = createStickyNotePlugin();
                            game?.loadPlugin(plugin);
                            refresh();
                        }}
                        className="w-full px-2 py-1 bg-secondary hover:bg-surface-hover border border-border rounded text-xs text-left cursor-pointer"
                    >
                        📝 Sticky Note Generator
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * Create a plugin object from inline code (JSON string).
 */
function createPluginFromCode(name: string, code: string): Plugin {
    try {
        const parsed = JSON.parse(code);
        return {
            id: parsed.id || `plugin-${Date.now()}`,
            name: parsed.name || name,
            version: parsed.version || "1.0.0",
            tools: parsed.tools || [],
            onActivate: parsed.onActivate,
            onDeactivate: parsed.onDeactivate,
        };
    } catch {
        throw new Error("Invalid JSON");
    }
}

/**
 * Demo plugin: Spray paint tool that creates random colored dots.
 */
function createSprayPaintPlugin(): Plugin {
    const tool: CustomToolDefinition = {
        id: "sprayPaint",
        name: "Spray Paint",
        cursor: "crosshair",
        onMouseDown: (ctx, x, y) => {
            const game = ctx.game;
            for (let i = 0; i < 20; i++) {
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * 30;
                const px = x + Math.cos(angle) * radius;
                const py = y + Math.sin(angle) * radius;
                const colors = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7"];
                const color = colors[Math.floor(Math.random() * colors.length)];
                game.commitShape({
                    type: "rect",
                    x: px,
                    y: py,
                    width: 2,
                    height: 2,
                    style: { ...game.currentStyle, strokeColor: color, backgroundColor: color },
                });
            }
        },
        onMouseMove: (ctx, x, y) => {
            const tool = ctx.game.getPluginTools().find(t => t.id === "sprayPaint");
            tool?.onMouseDown?.(ctx, x, y, new MouseEvent("mousemove"));
        },
    };

    return {
        id: "spray-paint-plugin",
        name: "Spray Paint",
        version: "1.0.0",
        tools: [tool],
    };
}

/**
 * Demo plugin: Sticky note generator that creates random colored sticky notes.
 */
function createStickyNotePlugin(): Plugin {
    const tool: CustomToolDefinition = {
        id: "stickyGenerator",
        name: "Sticky Generator",
        cursor: "crosshair",
        onMouseDown: (ctx, x, y) => {
            const game = ctx.game;
            const notes = ["TODO", "FIXME", "NOTE", "IDEA", "REVIEW"];
            const colors = ["#fff9b1", "#ff8a80", "#82b1ff", "#b9f6ca", "#ea80fc"];
            const note = notes[Math.floor(Math.random() * notes.length)];
            const color = colors[Math.floor(Math.random() * colors.length)];
            game.commitShape({
                type: "stickyNote",
                x,
                y,
                width: 120,
                height: 120,
                noteColor: color,
                text: note,
            });
        },
    };

    return {
        id: "sticky-generator-plugin",
        name: "Sticky Note Generator",
        version: "1.0.0",
        tools: [tool],
    };
}
