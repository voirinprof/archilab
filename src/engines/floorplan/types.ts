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
  /** One room (`room`) or several (`rooms`), each with at least / at most this area. */
  | { type: 'min_area' | 'max_area'; room?: string; rooms?: string[]; value: number; label: Localized }
  /** Each room touches at least one of these sides of the plan. */
  | { type: 'touches_any_side'; rooms: string[]; sides: Side[]; label: Localized }
  /** The room `from` is at most `value` metres from each of `to` (rooms or context elements). */
  | { type: 'max_distance'; from: string; to: string[]; value: number; label: Localized }
  /** Every room (or the listed ones) can be reached from a context element through free floor at least `width` metres wide. */
  | { type: 'accessible_width'; from: string; width: number; rooms?: string[]; label: Localized }
  | { type: 'adjacent' | 'not_adjacent'; rooms: [string, string]; min_shared?: number; label: Localized }
  | { type: 'touches_side'; room: string; side: Side; label: Localized }
  // Site constraints. Distances are in metres; min_distance may refer to a context element.
  | { type: 'min_setback'; room: string; sides: Side[]; value: number; label: Localized }
  | { type: 'min_distance'; rooms: [string, string]; value: number; label: Localized }
  | { type: 'max_coverage'; value: number; label: Localized }
  // Tree constraints: a tree is lost when a room comes within its root zone.
  | { type: 'keep_trees'; trees: string[]; label: Localized }
  | { type: 'min_trees_kept'; value: number; label: Localized }
  // Door constraints (mode: doors). A space is a room id or 'circulation' (the free cells of the plan).
  | { type: 'entrance'; side?: Side; spaces?: string[]; label: Localized }
  | { type: 'all_reachable'; label: Localized }
  | { type: 'door_between' | 'no_door_between'; rooms: [string, string]; label: Localized }
  | { type: 'reachable_avoiding'; room: string; avoid: string; label: Localized }
  | { type: 'max_doors'; value: number; label: Localized };

/** A fixed element around or on the plan (street, neighbouring building, tree). It may lie outside the plan. */
export type ContextSpec = {
  id: string;
  kind: 'street' | 'building' | 'tree' | 'entrance';
  label: Localized;
  rect: Rect;
  /** Trees: root protection zone around the trunk, in metres; building inside it kills the tree. Drawn as the crown. */
  root_radius?: number;
  /** false: rooms may be built over this element (default true). */
  blocking?: boolean;
  heritage?: boolean;
  hide_label?: boolean;
};

/** A measured distance drawn on the plan, in metres. */
export type DimensionLine = { kind: 'setback' | 'distance'; from: [number, number]; to: [number, number]; value: number; ok: boolean };

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
    /** Name of the building in the metrics (default « Logement » / « Home »). */
    building?: Localized;
    /** layout (default): move and resize rooms. doors: rooms are fixed, the player places doors. */
    mode?: 'layout' | 'doors';
    circulation?: Localized;
    /** SVG units per metre (default 40). Large sites need a smaller scale so labels stay readable. */
    scale?: number;
    /** wall (default): the plan outline is the outer wall. lot: the plan is a piece of land with a property line. */
    boundary?: 'wall' | 'lot';
    context?: ContextSpec[];
    /** Hint number (from 1) from which the buildable zone is drawn on the plan. */
    reveal_zone_hint?: number;
    /** Highest number of trees that can be kept (checked by the tests); reaching it earns the feedback.best message. */
    best_possible?: number;
  };
  constraints: FloorplanConstraint[];
  hints: LocalizedList;
  feedback: { success: Localized; failure: Localized; best?: Localized };
  explanation: Localized;
};

// ---------- furnish mode: fixed-size furniture that can be rotated, each with its usage zones ----------

export type Rotation = 0 | 90 | 180 | 270;
/** Usage zone depths in metres, relative to the item: in rotation 0, front is south, back north, left west, right east. */
export type UsageSides = { front?: number; back?: number; left?: number; right?: number };

export type FurnitureSpec = {
  id: string;
  label: Localized;
  color: string;
  /** Size in rotation 0. */
  size: { width: number; depth: number };
  /** Top-left corner of the rotated footprint. */
  initial: { x: number; y: number; rotation: Rotation };
  usage?: UsageSides;
  /** Built-in elements (bathroom, kitchenette) cannot be moved. */
  fixed?: boolean;
};

/** A door or window in an outer wall, `at` metres from the west (or north) end of that wall. */
export type OpeningSpec = { id: string; kind: 'door' | 'window'; label: Localized; side: Side; at: number; width: number; swing?: number };

export type PlacedFurniture = { id: string; x: number; y: number; rotation: Rotation };

export type FurnishConstraint =
  | { type: 'usage_clear'; items: string[]; label: Localized }
  | { type: 'min_passage'; from: string; to: string[]; width: number; label: Localized }
  | { type: 'min_distance' | 'max_distance'; rooms: [string, string]; value: number; label: Localized };

export type FurnishActivity = Omit<FloorplanActivity, 'parameters' | 'constraints'> & {
  parameters: {
    mode: 'furnish';
    plan: Plan;
    scale?: number;
    /** Snapping step in metres. */
    step: number;
    items: FurnitureSpec[];
    openings: OpeningSpec[];
    /** Hint number (from 1) from which the walkable area is drawn. */
    reveal_passage_hint?: number;
  };
  constraints: FurnishConstraint[];
};

// ---------- renovate mode: an existing building whose partitions are moved to fit a new programme ----------

/** A straight wall run along grid lines, from one point to another, in metres. */
export type Run = [[number, number], [number, number]];

/** exterior, bearing and water walls are fixed; partitions can be demolished; new walls are built by the player. */
export type WallKind = 'exterior' | 'bearing' | 'water' | 'partition' | 'new';

/** The player's works: demolished partitions, new walls and doors opened or closed (segment keys). */
export type Works = { removed: string[]; added: string[]; doorFlips: string[] };

export type UseSpec = { id: string; label: Localized; color: string };

export type RenovateConstraint =
  | { type: 'use_count'; use: string; min: number; min_area?: number; label: Localized }
  /** Every room with one of these uses exists and has at least the given area. */
  | { type: 'use_min_area'; areas: Record<string, number>; label: Localized }
  | { type: 'use_has_window' | 'use_touches_water'; uses: string[]; label: Localized }
  | { type: 'all_assigned' | 'all_reachable'; label: Localized }
  | { type: 'reachable_avoiding_use'; uses: string[]; avoid: string; label: Localized }
  | { type: 'no_door_between_uses'; uses: [string, string]; label: Localized }
  | { type: 'max_cost'; value: number; label: Localized };

export type RenovateActivity = Omit<FloorplanActivity, 'parameters' | 'constraints'> & {
  parameters: {
    mode: 'renovate';
    plan: Plan;
    scale?: number;
    load_bearing: Run[];
    /** Walls holding the water pipes: rooms on either side can become kitchens or bathrooms. */
    water: Run[];
    partitions: Run[];
    /** Existing doors, 1 m runs on existing walls; one on the outer wall is the entrance. */
    doors: Run[];
    windows: Run[];
    uses: UseSpec[];
    costs: { demolish: number; build: number; door: number };
    /** Cost at or below which the « very economical » message is shown (a solution at this cost is checked by the tests). */
    good_cost?: number;
    /** Former use of each existing room, shown faintly: label and one cell inside it. */
    former?: { label: Localized; at: [number, number] }[];
  };
  constraints: RenovateConstraint[];
};
