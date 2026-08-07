/**
 * Plugin system for extending the drawing canvas with custom tools.
 *
 * A plugin can register new tools, add UI panels, and hook into the
 * canvas rendering pipeline.
 */

import { Game } from "./Game";

/**
 * Context passed to plugin lifecycle hooks.
 * Provides access to the game engine and canvas state.
 */
export interface PluginContext {
    game: Game;
    canvas: HTMLCanvasElement;
    addTool: (tool: CustomToolDefinition) => void;
    removeTool: (id: string) => void;
    onRender: (callback: () => void) => () => void;
}

/**
 * Definition of a custom tool provided by a plugin.
 */
export interface CustomToolDefinition {
    id: string;
    name: string;
    icon?: string;
    cursor?: string;
    onMouseDown?: (ctx: PluginContext, x: number, y: number, e: MouseEvent) => void;
    onMouseMove?: (ctx: PluginContext, x: number, y: number, e: MouseEvent) => void;
    onMouseUp?: (ctx: PluginContext, x: number, y: number, e: MouseEvent) => void;
    onKeyDown?: (ctx: PluginContext, e: KeyboardEvent) => boolean;
    renderOverlay?: (ctx: PluginContext, canvasCtx: CanvasRenderingContext2D) => void;
}

/**
 * A plugin module that can extend the canvas.
 */
export interface Plugin {
    id: string;
    name: string;
    version: string;
    tools?: CustomToolDefinition[];
    onActivate?: (ctx: PluginContext) => void;
    onDeactivate?: (ctx: PluginContext) => void;
}

/**
 * Registry for managing loaded plugins.
 */
export class PluginRegistry {
    private plugins = new Map<string, Plugin>();
    private tools = new Map<string, CustomToolDefinition>();
    private renderCallbacks = new Set<() => void>();
    private ctx: PluginContext | null = null;

    initialize(game: Game, canvas: HTMLCanvasElement) {
        this.ctx = {
            game,
            canvas,
            addTool: (tool) => this.registerTool(tool),
            removeTool: (id) => this.unregisterTool(id),
            onRender: (cb) => {
                this.renderCallbacks.add(cb);
                return () => this.renderCallbacks.delete(cb);
            },
        };
    }

    getContext(): PluginContext | null {
        return this.ctx;
    }

    load(plugin: Plugin): boolean {
        if (this.plugins.has(plugin.id)) {
            console.warn(`Plugin ${plugin.id} is already loaded`);
            return false;
        }

        this.plugins.set(plugin.id, plugin);

        if (plugin.tools) {
            for (const tool of plugin.tools) {
                this.registerTool(tool);
            }
        }

        plugin.onActivate?.(this.ctx!);
        return true;
    }

    unload(pluginId: string): boolean {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) return false;

        if (plugin.tools) {
            for (const tool of plugin.tools) {
                this.unregisterTool(tool.id);
            }
        }

        plugin.onDeactivate?.(this.ctx!);
        this.plugins.delete(pluginId);
        return true;
    }

    private registerTool(tool: CustomToolDefinition) {
        this.tools.set(tool.id, tool);
    }

    private unregisterTool(toolId: string) {
        this.tools.delete(toolId);
    }

    getTool(toolId: string): CustomToolDefinition | undefined {
        return this.tools.get(toolId);
    }

    getAllTools(): CustomToolDefinition[] {
        return Array.from(this.tools.values());
    }

    getPlugin(pluginId: string): Plugin | undefined {
        return this.plugins.get(pluginId);
    }

    getAllPlugins(): Plugin[] {
        return Array.from(this.plugins.values());
    }

    isToolRegistered(toolId: string): boolean {
        return this.tools.has(toolId);
    }

    renderOverlays(ctx: CanvasRenderingContext2D) {
        for (const cb of this.renderCallbacks) {
            try {
                cb();
            } catch (e) {
                console.error("Plugin render callback error:", e);
            }
        }
    }
}
