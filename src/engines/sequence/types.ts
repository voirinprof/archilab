import type { Localized, LocalizedList } from '../../types.ts';

/** One step of the process. `layer` names a part of the illustration that appears once the step is done. */
export type Step = { id: string; label: Localized; detail: Localized; icon: string; layer: string };

/** `before` must be done before `after`, for the given reason (shown when the order is wrong). */
export type Dependency = { before: string; after: string; reason: Localized };

export type SequenceConstraint = { type: 'respects_dependencies'; label: Localized };

export type SequenceActivity = {
  id: string;
  engine: 'sequence';
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
    /** Drawing used to show the progress; `house` is the only one so far. */
    illustration: 'house';
    steps: Step[];
    dependencies: Dependency[];
    /** Order of the cards at the start (fixed, so every visitor gets the same puzzle). */
    initial_order: string[];
  };
  constraints: SequenceConstraint[];
  hints: LocalizedList;
  feedback: { success: Localized; failure: Localized };
  explanation: Localized;
};
