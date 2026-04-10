/**
 * When opening Write Captions from Plan My Week (Compose / Repurpose), we load
 * from localStorage. React Strict Mode mounts → unmounts → remounts Compose,
 * which clears localStorage on the first pass and resets component refs. The
 * delayed Firestore restore for compose_media would then overwrite the handoff.
 * This flag blocks that restore until the user leaves the compose page.
 */
let strategyHandoffBlocksFirestoreRestore = false;

export function setComposeStrategyHandoffActive(active: boolean): void {
  strategyHandoffBlocksFirestoreRestore = active;
}

export function isComposeStrategyHandoffActive(): boolean {
  return strategyHandoffBlocksFirestoreRestore;
}
