import type { Localized, LocalizedList } from '../../types.ts';

export type Cell = [number, number];

/** A kind of plot. All of its effects are data, so a new neighbourhood is only a new YAML file. */
export type TileType = {
  id: string;
  label: Localized;
  color: string;
  icon: string;
  residents?: number;
  /** A service people need to reach on foot (school, shops, park, bus stop). */
  service?: boolean;
  /** People can walk through it (streets, paths, parks, tree-lined walks). */
  walkable: boolean;
  /** Share of the plot where rain soaks into the ground, from 0 to 1. */
  permeable: number;
  green?: boolean;
  /** Blocks noise (a row of trees). */
  screen?: boolean;
  /** Simplified heat index of the plot itself; green neighbours cool it down. */
  heat: number;
  /** Must touch a plot of this type (e.g. a bus stop on the main street). */
  next_to?: string;
  /** Given at the start and not editable (street, motorway). */
  fixed?: boolean;
};

/** A rectangle of plots of one type, from one corner to the other (included). */
export type Area = { type: string; from: Cell; to: Cell };

export type DistrictConstraint =
  | { type: 'min_population'; value: number; label: Localized }
  | { type: 'services_within'; services: string[]; value: number; label: Localized }
  | { type: 'min_green_share' | 'max_impermeable_share'; value: number; label: Localized }
  | { type: 'no_noisy_homes'; label: Localized };

export type DistrictActivity = {
  id: string;
  engine: 'district';
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
    grid: { width: number; height: number };
    /** Metres per plot side and minutes of walking per plot, for the labels. */
    plot_metres: number;
    minutes_per_plot: number;
    tiles: TileType[];
    fixed: Area[];
    /** Noise: plots of this type are loud up to `reach` plots away, unless a screen stands in between. */
    noise: { source: string; reach: number };
    /** Cooling of a plot per green neighbour, for the heat layer. */
    cooling: number;
  };
  constraints: DistrictConstraint[];
  hints: LocalizedList;
  feedback: { success: Localized; failure: Localized };
  explanation: Localized;
};
