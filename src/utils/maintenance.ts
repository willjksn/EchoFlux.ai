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

// NOTE:
// Invite-only allowlisting is intentionally NOT implemented here because this file is bundled
// into the browser when using VITE_ variables. Invite-only allowlists must remain server-side.

