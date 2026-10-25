import type { CarbonActivity, CarbonConstraint, Design, Metric } from './types.ts';

type Params = CarbonActivity['parameters'];

export type Footprint = {
  /** Heating need, kWh per m² of floor and per year. */
  heatingNeed: number;
  windowArea: number;
  /** kg CO₂e for building it, by item. */
  embodied: { structure: number; insulation: number; windows: number; heating: number };
  /** kg CO₂e of heating energy over the whole lifetime. */
  operational: number;
  embodiedTotal: number;
  total: number;
};

export function initialDesign(p: Params): Design {
  return { ...p.initial, thickness: p.thickness.initial, glazing: p.glazing.initial };
}

const pick = <T extends { id: string }>(list: T[], id: string) => list.find(o => o.id === id)!;

/**
 * Simplified footprint over the building's lifetime: materials (embodied carbon) plus heating energy (operational carbon).
 * Heat losses = U × area of walls/roof/floor and windows + ventilation; free solar gains through the windows.
 */
export function footprint(p: Params, d: Design): Footprint {
  const shape = pick(p.shapes, d.shape), structure = pick(p.structures, d.structure);
  const insulation = pick(p.insulations, d.insulation), windows = pick(p.windows, d.windows), heating = pick(p.heatings, d.heating);
  const ph = p.physics;
  const windowArea = (d.glazing / 100) * p.floor_area;
  const opaqueArea = shape.envelope - windowArea;
  const uOpaque = 1 / (ph.surface_resistance + d.thickness / 100 / ph.lambda);
  const lossesWPerK = uOpaque * opaqueArea + windows.u * windowArea + ph.ventilation_w_per_k;
  const losses = lossesWPerK * ph.degree_kilohours; // kWh per year
  const gains = Math.min(windowArea * ph.solar_gain_per_m2, losses * ph.max_gain_share);
  const need = losses - gains;
  const operational = (need / heating.efficiency) * heating.kg_per_kwh * p.lifetime;
  const embodied = {
    structure: structure.kg_per_m2 * p.floor_area,
    insulation: insulation.kg_per_m2_cm * d.thickness * opaqueArea,
    windows: windows.kg_per_m2 * windowArea,
    heating: heating.embodied_kg,
  };
  const embodiedTotal = embodied.structure + embodied.insulation + embodied.windows + embodied.heating;
  return { heatingNeed: need / p.floor_area, windowArea, embodied, operational, embodiedTotal, total: embodiedTotal + operational };
}

/** Value of a metric in the units used by the constraints: tonnes for carbon, kWh/m²·year, % of floor area. */
export function metric(m: Metric, f: Footprint, d: Design): number {
  switch (m) {
    case 'total': return f.total / 1000;
    case 'embodied': return f.embodiedTotal / 1000;
    case 'operational': return f.operational / 1000;
    case 'heating_need': return f.heatingNeed;
    case 'glazing': return d.glazing;
  }
}

export function checkCarbon(c: CarbonConstraint, f: Footprint, d: Design): boolean {
  const v = metric(c.metric, f, d);
  return c.type === 'max' ? v <= c.value + 1e-9 : v >= c.value - 1e-9;
}

export function evaluateCarbon(constraints: CarbonConstraint[], p: Params, d: Design) {
  const f = footprint(p, d);
  const results = constraints.map(c => checkCarbon(c, f, d));
  return { footprint: f, constraints: results, solved: results.every(Boolean) };
}
