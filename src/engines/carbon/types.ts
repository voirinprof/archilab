import type { Localized, LocalizedList } from '../../types.ts';

type Option = { id: string; label: Localized };
export type ShapeOption = Option & { kind: 'compact' | 'long' | 'ell'; envelope: number; storeys: number };
export type StructureOption = Option & { kg_per_m2: number; color: string };
export type InsulationOption = Option & { kg_per_m2_cm: number };
export type WindowOption = Option & { u: number; kg_per_m2: number; panes: number };
export type HeatingOption = Option & { efficiency: number; kg_per_kwh: number; embodied_kg: number; kind: 'gas' | 'electric' | 'heat-pump' | 'wood' };
export type Slider = { min: number; max: number; step: number; initial: number };

/** Every value the player can change. */
export type Design = {
  shape: string;
  structure: string;
  insulation: string;
  thickness: number;
  glazing: number;
  windows: string;
  heating: string;
};

export type Metric = 'total' | 'embodied' | 'operational' | 'heating_need' | 'glazing';

export type CarbonConstraint = { type: 'max' | 'min'; metric: Metric; value: number; label: Localized };

export type CarbonActivity = {
  id: string;
  engine: 'carbon';
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
    floor_area: number;
    lifetime: number;
    /** Simplified building physics. */
    physics: {
      lambda: number;
      surface_resistance: number;
      ventilation_w_per_k: number;
      /** Heating degree-hours per year, in thousands of kelvin-hours. */
      degree_kilohours: number;
      solar_gain_per_m2: number;
      max_gain_share: number;
    };
    shapes: ShapeOption[];
    structures: StructureOption[];
    insulations: InsulationOption[];
    thickness: Slider;
    glazing: Slider;
    windows: WindowOption[];
    heatings: HeatingOption[];
    initial: Omit<Design, 'thickness' | 'glazing'>;
  };
  constraints: CarbonConstraint[];
  hints: LocalizedList;
  feedback: { success: Localized; failure: Localized };
  explanation: Localized;
};
