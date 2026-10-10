export const genders = ["female", "male", "other"] as const;
export type Gender = (typeof genders)[number];

interface State {
  count: number;
  gender: Gender;
  /** A locale switch is waiting for its catalog. */
  switching: boolean;
}

export const state: State = { count: 2, gender: "female", switching: false };

const listeners = new Set<() => void>();

export function subscribe(listener: () => void): void {
  listeners.add(listener);
}

export function update(patch: Partial<State>): void {
  Object.assign(state, patch);
  for (const listener of listeners) listener();
}
