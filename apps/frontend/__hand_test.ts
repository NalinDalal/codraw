/**
 * Headless test: hand-mode panning must NOT draw shapes; tool switch must clear selection.
 */
import { Game } from "@/draw/Game";

const noop = () => {};
const ctxProxy: any = new Proxy(
    {},
    {
        get: (_t, prop) => {
            if (prop === "canvas") return null;
            if (typeof prop === "string" && prop !== "then") return () => ctxProxy;
            return ctxProxy;
        },
        set: () => true,
    },
);

function fakeCanvas() {
    return {
        width: 800,
        height: 600,
        getContext: () => ctxProxy,
        addEventListener: noop,
        removeEventListener: noop,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
        style: {},
        clientWidth: 800,
        clientHeight: 600,
    } as any;
}

class FakeWindow extends EventTarget {}
const fakeWin = new FakeWindow() as any;
(globalThis as any).window = fakeWin;
(globalThis as any).document = {
    documentElement: { classList: { contains: () => false } },
    createElement: () => fakeCanvas(),
} as any;
(globalThis as any).localStorage = {
    getItem: () => null,
    setItem: noop,
    removeItem: noop,
};
(globalThis as any).WebSocket = class {
    static OPEN = 1;
    readyState = 1;
    send = noop;
    onmessage: any = null;
    close = noop;
};

const socket: any = new (globalThis as any).WebSocket();
const game: any = new Game(fakeCanvas(), "1", socket);
await new Promise((r) => setTimeout(r, 300));

const ev = (type: string, x: number, y: number, extra: any = {}) =>
    Object.assign(new Event(type), { clientX: x, clientY: y, button: 0, preventDefault: noop, stopPropagation: noop, shiftKey: false, ...extra });

let failures = 0;
const check = (name: string, cond: boolean) => {
    console.log((cond ? "PASS" : "FAIL") + ": " + name);
    if (!cond) failures++;
};

game.setTool("rect");
game.mouseDownHandler(ev("mousedown", 100, 100));
game.mouseMoveHandler(ev("mousemove", 200, 200));
game.mouseUpHandler(ev("mouseup", 200, 200));
check("baseline: rect draw created 1 shape", game.existingShapes.length === 1);

game.setTool("circle");
game.setHandPanning(true);
game.mouseDownHandler(ev("mousedown", 300, 300));
game.mouseMoveHandler(ev("mousemove", 450, 400));
game.mouseUpHandler(ev("mouseup", 450, 400));
check("hand panning: no extra shape rendered", game.existingShapes.length === 1);
console.log("  shapes after pan:", game.existingShapes.length);

game.setHandPanning(false);
game.setTool("select");
game.mouseDownHandler(ev("mousedown", 150, 150));
game.mouseUpHandler(ev("mouseup", 150, 150));
check("select tool: clicked shape is selected", game.selectedIds.size === 1);
console.log("  selected:", [...game.selectedIds]);

game.setTool("pencil");
check("pencil switch clears selection", game.selectedIds.size === 0);

game.setTool("select");
game.mouseDownHandler(ev("mousedown", 150, 150));
game.mouseUpHandler(ev("mouseup", 150, 150));
game.setTool("pencil");
check("keyboard-path pencil switch clears selection", game.selectedIds.size === 0);

game.setTool("select");
game.mouseDownHandler(ev("mousedown", 150, 150));
game.mouseUpHandler(ev("mouseup", 150, 150));
game.setHandPanning(true);
game.setTool("pencil");
check("pencil while hand mode: still clears selection", game.selectedIds.size === 0);

console.log("DEBUG shapes:", JSON.stringify(game.existingShapes.map((s: any) => ({ id: s.id, type: s.type, x: s.x, y: s.y, w: s.w, h: s.h, width: s.width, height: s.height }))));

process.exit(failures ? 1 : 0);

console.log("DEBUG shapes:", JSON.stringify(game.existingShapes.map((s: any) => ({ id: s.id, type: s.type, x: s.x, y: s.y, w: s.w, h: s.h, width: s.width, height: s.height, points: s.points?.length })), null, 1));
