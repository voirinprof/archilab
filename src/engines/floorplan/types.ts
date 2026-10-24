import type { Localized, LocalizedList } from '../../types.ts';

/** A rectangle on the plan grid, in metres. Origin is the north-west corner (top left). */
export type Rect = { x: number; y: number; width: number; depth: number };
export type PlacedRoom = Rect & { id: string };
export type Plan = { width: number; depth: number };
export type Side = 'north' | 'south' | 'east' | 'west';
export type Bounds = { min: number; max: number };

export type RoomSpec = {
  id: string;
  label: Localized;
  color: string;
  initial: Rect;
  width: Bounds;
  depth: Bounds;
};

export type FloorplanConstraint =
  | { type: 'min_area' | 'max_area'; room: string; value: number; label: Localized }
  | { type: 'adjacent' | 'not_adjacent'; rooms: [string, string]; min_shared?: number; label: Localized }
  | { type: 'touches_side'; room: string; side: Side; label: Localized };

export type FloorplanActivity = {
  id: string;
  engine: 'floorplan';
  category: string;
  difficulty: string;
  duration_minutes: number;
  icon: string;
  color: string;
  title: Localized;
  description: Localized;
  mission: Localized;
  concepts: LocalizedList;
  parameters: { plan: Plan; rooms: RoomSpec[] };
  constraints: FloorplanConstraint[];
  hints: LocalizedList;
  feedback: { success: Localized; failure: Localized };
  explanation: Localized;
};
