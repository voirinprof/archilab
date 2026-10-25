import type { Localized, LocalizedList } from '../../types.ts';

export type Season = 'winter' | 'equinox' | 'summer';
export type Facade = 'north' | 'east' | 'south' | 'west';
/** Rectangle in metres: x towards the east, y towards the south. */
export type Box = { x: number; y: number; width: number; depth: number };

/** A window on the outer wall of a room, from `from` to `to` metres along that wall (west→east or north→south). */
export type SunWindow = { facade: Facade; from: number; to: number };

/** A room of the house, in the house's own frame (as drawn with rotation 0, north up). */
export type SunRoom = { id: string; label: Localized; color: string; box: Box; windows: SunWindow[] };

/** A neighbouring building that casts a shadow, in site coordinates. */
export type Obstacle = { id: string; label: Localized; box: Box; height: number };

export type SunConstraint = {
  type: 'min_sun_hours' | 'max_sun_hours';
  rooms: string[];
  season: Season;
  from: number;
  to: number;
  value: number;
  label: Localized;
};

export type SunActivity = {
  id: string;
  engine: 'sun';
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
    latitude: number;
    site: { width: number; depth: number };
    /** Where the centre of the house stands on the site. */
    house_at: { x: number; y: number };
    house: { width: number; depth: number; rooms: SunRoom[] };
    obstacles: Obstacle[];
    initial_rotation: number;
    rotation_step: number;
    /** Hint number (from 1) from which the sun paths are drawn. */
    reveal_paths_hint?: number;
  };
  constraints: SunConstraint[];
  hints: LocalizedList;
  feedback: { success: Localized; failure: Localized };
  explanation: Localized;
};
