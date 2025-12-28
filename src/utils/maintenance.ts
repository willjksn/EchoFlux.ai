/**
 * Maintenance Mode Configuration
 * 
 * To enable maintenance mode:
 * 1. Set VITE_MAINTENANCE_MODE=true in your .env file or Vercel environment variables
 * 2. Optionally set VITE_ALLOWED_EMAIL to your email to bypass maintenance mode
 * 
 * To disable: Set VITE_MAINTENANCE_MODE=false or remove it
 */

export const isMaintenanceMode = (): boolean => {
    // Check environment variable (works in both dev and production)
    const maintenanceMode = import.meta.env.VITE_MAINTENANCE_MODE;
    
    // Convert to string and normalize for comparison
    const modeStr = String(maintenanceMode || '').trim().toLowerCase();
    
    // Handle various representations of 'true'
    const isEnabled = modeStr === 'true' || 
                      modeStr === '1' || 
                      modeStr === 'yes' ||
                      maintenanceMode === true; // Also handle actual boolean true
    
    // Debug logging - always log to help troubleshoot
    if (typeof window !== 'undefined') {
        console.log('🔧 Maintenance Mode Check:', {
            envValue: maintenanceMode,
            modeStr: modeStr,
            type: typeof maintenanceMode,
            isEnabled: isEnabled,
            allEnvVars: Object.keys(import.meta.env).filter(k => k.includes('MAINTENANCE'))
        });
    }
    
    return isEnabled;
};

export const getAllowedEmail = (): string | null => {
    const allowedEmail = import.meta.env.VITE_ALLOWED_EMAIL;
    return allowedEmail || null;
};

export const canBypassMaintenance = (email: string | null | undefined): boolean => {
    if (!email) return false;
    const allowedEmail = getAllowedEmail();
    if (!allowedEmail) return false;
    return email.toLowerCase() === allowedEmail.toLowerCase();
};

/**
 * Invite Only Mode (Beta Allowlist)
 *
 * To enable invite-only:
 * - Set VITE_INVITE_ONLY=true
 * - Set VITE_INVITE_ALLOWLIST to a comma-separated list of allowed emails/domains
 *   Examples:
 *   - "user1@gmail.com,user2@company.com"
 *   - "@company.com" (allow any email at that domain)
 *   - "*@company.com" (same as @company.com)
 */
export const isInviteOnlyMode = (): boolean => {
    const v = import.meta.env.VITE_INVITE_ONLY;
    const s = String(v || '').trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || v === true;
};

export const getInviteAllowlist = (): string[] => {
    const raw = (import.meta.env.VITE_INVITE_ALLOWLIST || '') as string;
    return String(raw)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
};

export const isInvitedEmail = (email: string | null | undefined): boolean => {
    if (!email) return false;
    const allowlist = getInviteAllowlist();
    if (allowlist.length === 0) return false;

    const e = email.toLowerCase().trim();

    return allowlist.some((entryRaw) => {
        const entry = entryRaw.toLowerCase().trim();
        if (!entry) return false;

        // Domain allow patterns: "@domain.com" or "*@domain.com"
        if (entry.startsWith('@')) {
            return e.endsWith(entry);
        }
        if (entry.startsWith('*@')) {
            return e.endsWith(entry.substring(1)); // drop leading "*"
        }

        // Exact email match
        return e === entry;
    });
};

