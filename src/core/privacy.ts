export type PrivacyOwner = 'offthemap' | 'qr_guard';
export function privacyHold(
  previous: readonly PrivacyOwner[],
  owner: PrivacyOwner,
  hold: boolean,
): { state: PrivacyOwner[]; actions: ('protect' | 'restore')[] } {
  const state = hold
    ? [...new Set([...previous, owner])]
    : previous.filter((value) => value !== owner);
  return {
    state,
    actions:
      previous.length === 0 && state.length > 0
        ? ['protect']
        : previous.length > 0 && state.length === 0
          ? ['restore']
          : [],
  };
}
