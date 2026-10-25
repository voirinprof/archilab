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
    /** Road bars, given and not counted. */
    deck: Bar[];
    /** Points fixed to the cliffs (pins). */
    supports: Point[];
    /** Points where the truck's weight acts, and the load on each (kN, downwards). */
    loads: Point[];
    load: number;
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
