import type { GameContext } from "../gameContext";
import { ShapeLifecycle, type ShapeManagerApi } from "./shapeLifecycle";
import { ShapeArrangement } from "./shapeArrangement";
import { ShapeStyleManager } from "./shapeStyle";

/**
 * Facade that composes specialized shape managers.
 *
 * Retains the original `ShapeManager` public API so existing call sites
 * (`Game.ts`, `shortcutRegistry.ts`, etc.) do not need to change.
 */
export class ShapeManager extends ShapeLifecycle {
    private readonly arrangement: ShapeArrangement;
    private readonly style: ShapeStyleManager;

    constructor(context: GameContext, api: ShapeManagerApi) {
        super(context, api);
        this.arrangement = new ShapeArrangement(context, api);
        this.style = new ShapeStyleManager(context, api);
    }

    // ── Arrangement ─────────────────────────────────────────────
    group() { return this.arrangement.group(); }
    ungroup() { return this.arrangement.ungroup(); }
    bringForward() { return this.arrangement.bringForward(); }
    sendBackward() { return this.arrangement.sendBackward(); }
    bringToFront() { return this.arrangement.bringToFront(); }
    sendToBack() { return this.arrangement.sendToBack(); }
    alignLeft() { return this.arrangement.alignLeft(); }
    alignRight() { return this.arrangement.alignRight(); }
    alignCenter() { return this.arrangement.alignCenter(); }
    alignTop() { return this.arrangement.alignTop(); }
    alignBottom() { return this.arrangement.alignBottom(); }
    distributeHorizontal() { return this.arrangement.distributeHorizontal(); }
    distributeVertical() { return this.arrangement.distributeVertical(); }

    // ── Style ───────────────────────────────────────────────────
    flipSelectedShapes(horizontal: boolean) { return this.style.flipSelectedShapes(horizontal); }
    lockShapes() { return this.style.lockShapes(); }
    unlockShapes() { return this.style.unlockShapes(); }
    copySelectedStyles() { return this.style.copySelectedStyles(); }
    pasteSelectedStyles() { return this.style.pasteSelectedStyles(); }
}
