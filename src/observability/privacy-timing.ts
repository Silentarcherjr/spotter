/** Measure the time from starting the decided privacy action through confirmed OBS readback. */
export function timedPrivacy(
  clock: () => number,
  privacy: () => Promise<void>,
  confirm: () => Promise<void>,
) {
  let started: number | null = null;
  let finished: number | null = null;
  return {
    async privacy() {
      started = clock();
      finished = null;
      await privacy();
    },
    async confirm() {
      await confirm();
      finished = clock();
    },
    elapsed() {
      return started === null || finished === null ? null : Math.max(0, finished - started);
    },
  };
}
