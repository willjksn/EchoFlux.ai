export function isInviteOnlyMode(): boolean {
  const v = (import.meta as any)?.env?.VITE_INVITE_ONLY_MODE;
  if (!v) return false;
  const s = String(v).toLowerCase().trim();
  return s === 'true' || s === '1' || s === 'yes' || s === 'on';
}


