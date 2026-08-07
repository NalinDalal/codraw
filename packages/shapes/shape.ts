import type { RectShape } from "./rect";
import type { CircleShape } from "./circle";
import type { EllipsisArcShape } from "./ellipsisArc";
import type { PencilShape } from "./pencil";
import type { DiamondShape } from "./diamond";
import type { ArrowShape } from "./arrow";
import type { LineShape } from "./line";
import type { TextShape } from "./text";
import type { ImageShape } from "./image";
import type { EraserShape } from "./eraser";
import type { StickyNoteShape } from "./stickyNote";
import type { FrameShape } from "./frame";

export type Shape =
    | RectShape
    | CircleShape
    | EllipsisArcShape
    | PencilShape
    | DiamondShape
    | ArrowShape
    | LineShape
    | TextShape
    | ImageShape
    | EraserShape
    | StickyNoteShape
    | FrameShape;

export interface ShapeDiff {
    added: Map<string, Shape>;
    removed: Map<string, Shape>;
    modified: Map<string, { prev: Shape; next: Shape }>;
}

export interface LibraryItem {
    id: string;
    name: string;
    shapes: Shape[];
    createdAt: number;
}

export interface Library {
    id: string;
    name: string;
    items: LibraryItem[];
    createdAt: number;
}
