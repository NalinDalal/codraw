import { PluginRegistry, Plugin, CustomToolDefinition, PluginContext } from "../pluginSystem";
import type { Game } from "../Game";
import type { GameContext } from "../gameContext";

/**
 * Plugin system integration.
 *
 * Owns the PluginRegistry and exposes the plugin lifecycle surface:
 * load/unload plugins, enumerate loaded plugins and their custom tools,
 * and forward the context Game hands to the registry so plugin tools
 * can draw on the canvas.
 */
export class PluginManager {
    private registry = new PluginRegistry();

    constructor(private context: GameContext) {}

    /** Bind the registry to the owning Game instance and canvas. */
    initialize(game: Game, canvas: HTMLCanvasElement) {
        this.registry.initialize(game, canvas);
    }

    /** Get a registered custom tool by ID, or undefined. */
    getTool(toolId: string): CustomToolDefinition | undefined {
        return this.registry.getTool(toolId);
    }

    /** Get the plugin drawing context, or null if not initialized. */
    getContext(): PluginContext | null {
        return this.registry.getContext();
    }

    loadPlugin(plugin: Plugin): boolean {
        return this.registry.load(plugin);
    }

    unloadPlugin(pluginId: string): boolean {
        return this.registry.unload(pluginId);
    }

    getLoadedPlugins(): Plugin[] {
        return this.registry.getAllPlugins();
    }

    isToolRegistered(toolId: string): boolean {
        return this.registry.isToolRegistered(toolId);
    }

    getPluginTools(): CustomToolDefinition[] {
        return this.registry.getAllTools();
    }
}
