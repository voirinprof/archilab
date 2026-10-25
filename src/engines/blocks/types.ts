import type { Localized, LocalizedList } from '../../types.ts';

/** Number of blocks stacked on each cell, rows from north to south, columns from west to east: heights[y][x]. */
export type Heights = number[][];

export type View = 'top' | 'south' | 'east';

export type BlocksModel = { id: string; label: Localized; heights: Heights };

export type BlocksConstraint = { type: 'view_matches'; view: View; label: Localized };

export type BlocksActivity = {
  id: string;
  engine: 'blocks';
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
    max_height: number;
    models: BlocksModel[];
    /** Hint number (from 1) from which the target building is drawn as a ghost in the 3D view. */
    reveal_model_hint?: number;
  };
  constraints: BlocksConstraint[];
  hints: LocalizedList;
  feedback: { success: Localized; failure: Localized };
  explanation: Localized;
};
