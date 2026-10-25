import type { Localized, LocalizedList } from '../../types.ts';

/** Road directions, clockwise from the top of the plan (north). */
export type Dir = 'n' | 'e' | 's' | 'w';
/** Quarter turns, clockwise. */
export type Rotation = 0 | 90 | 180 | 270;

/**
 * What an element is for the rules:
 * - `road`: a road piece; its `connections` say where the road goes (crosswalks are road pieces too);
 * - `building`, `green`: fill their footprint on the ground;
 * - `tree`, `signal`: stand on a cell already holding something compatible (a tree on grass or green space, a traffic light on an intersection).
 */
export type ElementKind = 'road' | 'building' | 'green' | 'tree' | 'signal';

/** How an element is drawn; the drawing never changes the rules. */
export type ElementShape = 'road' | 'crosswalk' | 'house' | 'apartment' | 'school' | 'shop' | 'park' | 'green' | 'tree' | 'signal';

export type CityElement = {
  id: string;
  kind: ElementKind;
  shape: ElementShape;
  label: Localized;
  /** Main colour, used both on the 2D plan and in the isometric view. */
  color: string;
  /** Emoji shown on the 2D plan and in the legend. */
  icon: string;
  /** Footprint in cells before rotation: [width (west → east), depth (north → south)]. Default 1 × 1. */
  size?: [number, number];
  /** Height in cells, for volumes. */
  height?: number;
  /** Road pieces only: where the road goes before rotation. */
  connections?: Dir[];
  rotatable?: boolean;
};

/**
 * One character of the plan. `road` cells hold a road piece whose shape and orientation are worked out from the
 * neighbouring road cells; `element` is the expected element (on a road cell, a special road piece such as a crosswalk);
 * `overlay` is a tree or traffic light standing on the cell.
 */
export type PlanSymbol = {
  symbol: string;
  label: Localized;
  road?: boolean;
  element?: string;
  overlay?: string;
};

export type CityConstraint =
  | { id: string; type: 'match_roads'; label: Localized }
  | { id: string; type: 'no_dead_ends'; label: Localized }
  | { id: string; type: 'match_elements'; elements: string[]; label: Localized }
  /** Each placed element touches a road along an edge; with `grouped`, a group of touching cells only needs one of them to. */
  | { id: string; type: 'touch_road'; elements: string[]; grouped?: boolean; label: Localized };

export type CityStep = {
  id: string;
  label: Localized;
  /** What to do during the step. */
  intro: Localized;
  /** The idea discovered, shown once the step is solved. */
  explanation: Localized;
  /** Palette of the step. Ignored for the final step, which offers every element. */
  elements: string[];
  /** Constraint ids checked by this step. Ignored for the final step, which checks them all. */
  constraints: string[];
  hints: LocalizedList;
  success: Localized;
  final?: boolean;
};

export type IsoCityActivity = {
  id: string;
  engine: 'isocity';
  category: string;
  difficulty: string;
  duration_minutes: number;
  icon: string;
  color: string;
  title: Localized;
  description: Localized;
  mission: Localized;
  concepts: LocalizedList;
  parameters: {
    grid: { width: number; depth: number };
    elements: CityElement[];
    symbols: PlanSymbol[];
    /** One string per row, north to south; one character per cell, west to east. `.` is an empty lot. */
    plan: string[];
    /** Label of the empty lot in the legend. */
    empty_label: Localized;
    steps: CityStep[];
  };
  constraints: CityConstraint[];
  hints: LocalizedList;
  feedback: { success: Localized; failure: Localized };
  explanation: Localized;
};

/** An element placed by the player; (x, y) is the north-west cell of its footprint. */
export type Placed = { uid: number; element: string; x: number; y: number; rotation: Rotation };
