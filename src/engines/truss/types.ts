import type { Localized, LocalizedList } from '../../types.ts';

/** A grid point, in grid units: x to the right, y upwards (0 = road level). */
export type Point = [number, number];
export type Bar = [Point, Point];

export type TrussConstraint =
  | { type: 'stable' | 'strong'; label: Localized }
  | { type: 'max_bars'; value: number; label: Localized };

export type TrussActivity = {
  id: string;
  engine: 'truss';
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
    /** Grid points the player may use: x from..to, y from..to. */
    grid: { x: [number, number]; y: [number, number] };
    /** Metres per grid unit, for the labels. */
    unit: number;
    /** ravine (default): a bridge between two cliffs. ground: a structure standing on flat ground. */
    scene?: 'ravine' | 'ground';
    /** Bars given at the start and not counted: the road, or the tower's frame. */
    deck: Bar[];
    /** Strength of the given bars compared with the player's beams (default 1): e.g. concrete floors are much stronger. */
    deck_strength?: number;
    /** Points fixed to the cliffs (pins). */
    supports: Point[];
    /** Points where the load acts, the load on each (kN) and its direction (default downwards, [0, -1]). */
    loads: Point[];
    load: number;
    load_direction?: [number, number];
    /** Name of the load shown on the drawing, e.g. « Camion » or « Vent ». */
    load_label?: Localized;
    /** Longest bar allowed, in grid units. */
    max_length: number;
    /** Strength of a bar: tension limit, and compression limit for a 1-unit bar (it shrinks with the square of the length). */
    tension_limit: number;
    compression_limit: number;
    /** Hint number (from 1) from which a sample triangle pattern is drawn faintly. */
    reveal_pattern_hint?: number;
    pattern?: Bar[];
  };
  constraints: TrussConstraint[];
  hints: LocalizedList;
  feedback: { success: Localized; failure: Localized };
  explanation: Localized;
};
