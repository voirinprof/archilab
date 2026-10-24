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
  /** Size limits; a room without them keeps its initial size. */
  width?: Bounds;
  depth?: Bounds;
};

export type FloorplanConstraint =
  | { type: 'min_area' | 'max_area'; room: string; value: number; label: Localized }
  | { type: 'adjacent' | 'not_adjacent'; rooms: [string, string]; min_shared?: number; label: Localized }
  | { type: 'touches_side'; room: string; side: Side; label: Localized }
  // Door constraints (mode: doors). A space is a room id or 'circulation' (the free cells of the plan).
  | { type: 'entrance'; side?: Side; spaces?: string[]; label: Localized }
  | { type: 'all_reachable'; label: Localized }
  | { type: 'door_between' | 'no_door_between'; rooms: [string, string]; label: Localized }
  | { type: 'reachable_avoiding'; room: string; avoid: string; label: Localized }
  | { type: 'max_doors'; value: number; label: Localized };

/** A 1 m piece of wall between two different spaces, where a door can be placed. */
export type WallSegment = { key: string; x1: number; y1: number; x2: number; y2: number; a: string; b: string; side?: Side };

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
  parameters: {
    plan: Plan;
    rooms: RoomSpec[];
    /** layout (default): move and resize rooms. doors: rooms are fixed, the player places doors. */
    mode?: 'layout' | 'doors';
    circulation?: Localized;
  };
  constraints: FloorplanConstraint[];
  hints: LocalizedList;
  feedback: { success: Localized; failure: Localized };
  explanation: Localized;
};
