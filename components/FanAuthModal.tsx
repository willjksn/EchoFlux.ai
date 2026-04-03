"use client";

import React, { useState, useEffect } from "react";
import { auth, db } from "../firebaseConfig";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
  fetchSignInMethodsForEmail,
} from "firebase/auth";
import type { FanAuthBranding } from "../types";
import { useAppContext } from "./AppContext";
import { isMaintenanceMode, canBypassMaintenance } from "../src/utils/maintenance";
import { validateMemberUsernameFormat, normalizeMemberUsername } from "../src/lib/memberUsername";
import { FAN_STOREFRONT_SIGNUP_SESSION_KEY } from "../constants";
import "../styles/fan-auth-modal.css";

const DEFAULT_FAN_AUTH_ACCENT = "#4a2c2c";
const BUILTIN_DEFAULT_PRIMARY = "#6366f1";

/** True when Google returns 403 / key or referrer rejection on Identity Toolkit (not wrong password). */
function isFirebaseIdentityToolkitConfigBlock(ex: unknown): boolean {
  const msg = String((ex as Error)?.message || "");
  const code = String((ex as { code?: string })?.code || "");
  const status = getHttpStatusFromFirebaseError(ex);
  if (code === "auth/invalid-api-key") return true;
  if (status === 403) return true;
  if (/\b403\b|REQUEST_DENIED|PERMISSION_DENIED|API key not valid|referr?er not allowed/i.test(msg)) return true;
  if (/identitytoolkit\.googleapis\.com/i.test(msg)) return true;
  return false;
}

function getHttpStatusFromFirebaseError(ex: unknown): number | undefined {
  const e = ex as {
    status?: number;
    customData?: { status?: number; _serverResponse?: string };
  };
  if (typeof e?.status === "number") return e.status;
  if (typeof e?.customData?.status === "number") return e.customData.status;
  if (typeof e?.customData?._serverResponse === "string") {
    // Firebase sometimes tucks HTTP status into a JSON serverResponse string.
    try {
      const parsed = JSON.parse(e.customData._serverResponse) as { error?: { code?: number } };
      if (typeof parsed?.error?.code === "number") return parsed.error.code;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

/** DevTools often collapses `console.error({ ex })` to "Object" — log plain fields. */
function logFanAuthError(context: string, ex: unknown): void {
  const e = ex as {
    code?: string;
    message?: string;
    name?: string;
    customData?: { status?: number; [k: string]: unknown };
  };
  const status = getHttpStatusFromFirebaseError(ex);
  const hint =
    status === 403 || /\b403\b/i.test(String(e?.message))
      ? "Fix: Firebase Auth Authorized domains + Google Cloud Browser API key referrer allowlist + Identity Toolkit API."
      : undefined;
  // Keep first line fully expanded so minified prod logs never show just "Object".
  console.error(
    `[FanAuth] ${context} | code=${String(e?.code || "")} | status=${String(status ?? "")} | message=${String(
      e?.message || "",
    )}`,
  );
  if (hint) console.error(`[FanAuth] hint: ${hint}`);
  // Include raw error separately for deep inspection when needed.
  console.debug("[FanAuth] raw error:", ex);
}

function lightenHex(hex: string, amount = 0.35): string {
  const n = hex.replace("#", "");
  if (n.length !== 6) return hex;
  const num = parseInt(n, 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  r = Math.round(r + (255 - r) * amount);
  g = Math.round(g + (255 - g) * amount);
  b = Math.round(b + (255 - b) * amount);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export type FanAuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialView: "login" | "signup";
  creatorId: string;
  displayName: string;
  logo?: string;
  avatar?: string;
  themePrimary?: string;
  themeText?: string;
  fontFamily?: string;
  branding?: FanAuthBranding | null;
  termsHref: string;
  privacyHref: string;
  freeAccessEnabled: boolean;
};

export const FanAuthModal: React.FC<FanAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialView,
  creatorId,
  displayName,
  logo,
  avatar,
  themePrimary,
  themeText,
  fontFamily = "Inter, system-ui, sans-serif",
  branding,
  termsHref,
  privacyHref,
  freeAccessEnabled,
}) => {
  const { showToast } = useAppContext();
  const [mode, setMode] = useState<"login" | "signup">(initialView);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialView);
    setFieldErrors({});
    setFormError("");
    setForgotOpen(false);
  }, [initialView, isOpen]);

  const community =
    branding?.communityName?.trim() ||
    `${displayName || "This creator"}'s member area`;

  const primary = branding?.primaryColor ?? themePrimary ?? BUILTIN_DEFAULT_PRIMARY;
  const accentText = branding?.accentTextColor ?? themeText ?? DEFAULT_FAN_AUTH_ACCENT;
  /** Tabs / active chip — custom `softTint`, else subtle tint from active primary */
  const softTint =
    branding?.softTint ??
    lightenHex(primary, 0.88);
  /**
   * Modal card background: custom `softTint` if set (same key as My Page “modal tint”).
   * Otherwise light pink when storefront still uses default indigo; subtle primary tint when they picked a theme;
   * never the old cream #fffef9.
   */
  const cardBackground = branding?.softTint ?? lightenHex(primary, 0.93);
  const gradTop = lightenHex(primary, 0.38);

  const loginTitle = branding?.loginTitle?.trim() || "Welcome back";
  const loginSubtitle = branding?.loginSubtitle?.trim() || `Log in to ${community}.`;
  const signupTitle = branding?.signupTitle?.trim() || "Create your account";
  const signupSubtitle =
    branding?.signupSubtitle?.trim() ||
    (freeAccessEnabled
      ? "Create your account to join this page."
      : "Create your account, then continue to secure checkout.");

  const mark = logo || avatar;
  const validatePassword = (p: string): string | null => {
    if (!p) return "Password is required";
    const requirements = {
      up: /[A-Z]/.test(p),
      low: /[a-z]/.test(p),
      spec: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p),
      num: /[0-9]/.test(p),
      len: p.length >= 8,
    };
    const miss: string[] = [];
    if (!requirements.up) miss.push("uppercase");
    if (!requirements.low) miss.push("lowercase");
    if (!requirements.spec) miss.push("special character");
    if (!requirements.num) miss.push("number");
    if (!requirements.len) miss.push("8+ characters");
    return miss.length ? `Password needs: ${miss.join(", ")}` : null;
  };

  const tryJoinFreeAndUsername = async (uname: string) => {
    if (!freeAccessEnabled || !auth.currentUser) return;
    try {
      const token = await auth.currentUser.getIdToken(true);
      const join = await fetch("/api/joinFreeMembership", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ creatorId }),
      });
      const joinData = await join.json().catch(() => ({}));
      if (!join.ok) {
        // Non-fatal: auth already succeeded, but membership bootstrap endpoint failed.
        const joinErr = (joinData as { error?: string }).error || "Signed in, but couldn't auto-join free membership yet.";
        setFormError(joinErr);
        showToast?.(joinErr, "info");
        return;
      }
      const trimmed = uname.trim();
      if (!trimmed) return;
      const fmt = validateMemberUsernameFormat(trimmed);
      if (fmt) {
        showToast?.(fmt, "error");
        return;
      }
      const claim = await fetch("/api/claimMemberUsername", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: normalizeMemberUsername(trimmed), creatorId }),
      });
      const claimData = await claim.json().catch(() => ({}));
      if (!claim.ok) {
        showToast?.((claimData as { error?: string }).error || "Account created — set your username next.", "info");
      }
    } catch {
      // Non-fatal in local dev when /api proxy is not configured.
      showToast?.("Signed in, but membership sync is temporarily unavailable.", "info");
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError("");
    setLoading(true);
    try {
      if (isMaintenanceMode() && !canBypassMaintenance(email)) {
        showToast?.("Sign-in is limited during maintenance. Please try again later.", "error");
        return;
      }
      if (mode === "login") {
        if (!email.trim()) {
          setFieldErrors({ email: "Email is required" });
          return;
        }
        if (!password) {
          setFieldErrors({ password: "Password is required" });
          return;
        }
        await signInWithEmailAndPassword(auth, email.trim(), password);
        if (freeAccessEnabled) {
          await tryJoinFreeAndUsername("");
        }
        showToast?.("You're in!", "success");
        onSuccess?.();
        onClose();
        return;
      }

      // signup
      const err: Record<string, string> = {};
      if (!fullName.trim() || fullName.trim().length < 2) err.fullName = "Enter your name (2+ characters).";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) err.email = "Valid email required.";
      const pwMsg = validatePassword(password);
      if (pwMsg) err.password = pwMsg;
      if (password !== confirmPassword) err.confirmPassword = "Passwords do not match.";
      if (freeAccessEnabled) {
        const uerr = validateMemberUsernameFormat(username);
        if (uerr) err.username = uerr;
      }
      if (!acceptedTerms) err.terms = "Accept the Terms and Privacy Policy to continue.";
      if (Object.keys(err).length) {
        setFieldErrors(err);
        const first =
          err.fullName ||
          err.username ||
          err.email ||
          err.password ||
          err.confirmPassword ||
          err.terms ||
          "Please fix the highlighted fields.";
        setFormError(first);
        showToast?.(first, "error");
        return;
      }

      try {
        const methods = await fetchSignInMethodsForEmail(auth, email.trim());
        if (methods.length > 0) {
          // Same fan can subscribe to multiple creators with one Firebase account.
          // If account exists, try logging in immediately with the provided password.
          try {
            await signInWithEmailAndPassword(auth, email.trim(), password);
            if (freeAccessEnabled) {
              await tryJoinFreeAndUsername(username);
            }
            showToast?.("Welcome back! We signed you in to continue.", "success");
            onSuccess?.();
            onClose();
            return;
          } catch {
            showToast?.("This email is already registered. Log in with your existing password.", "info");
            setFormError("This email already has an account. Please log in.");
            setMode("login");
            return;
          }
        }
      } catch {
        /* continue */
      }

      try {
        sessionStorage.setItem(FAN_STOREFRONT_SIGNUP_SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
      let cred;
      try {
        cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      } catch (createErr) {
        try {
          sessionStorage.removeItem(FAN_STOREFRONT_SIGNUP_SESSION_KEY);
        } catch {
          /* ignore */
        }
        throw createErr;
      }
      await updateProfile(cred.user, { displayName: fullName.trim() });
      await tryJoinFreeAndUsername(username);
      showToast?.("Account created!", "success");
      onSuccess?.();
      onClose();
    } catch (ex: unknown) {
      const code = (ex as { code?: string })?.code || "";
      logFanAuthError(`email flow failed (mode=${mode})`, ex);
      if (code === "auth/email-already-in-use") {
        // Retry as login so one email can be reused across creators seamlessly.
        try {
          await signInWithEmailAndPassword(auth, email.trim(), password);
          if (freeAccessEnabled) {
            await tryJoinFreeAndUsername(username);
          }
          showToast?.("Welcome back! We signed you in to continue.", "success");
          onSuccess?.();
          onClose();
          return;
        } catch {
          setFormError("This email is already registered. Try logging in.");
          showToast?.("Email already in use. Try logging in.", "error");
          setMode("login");
        }
      } else if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        setFieldErrors({ password: "Incorrect email or password." });
        showToast?.("Incorrect email or password.", "error");
      } else if (code === "auth/invalid-login-credentials") {
        setFieldErrors({ password: "Incorrect email or password." });
        showToast?.("Incorrect email or password.", "error");
      } else if (code === "auth/user-not-found") {
        setFieldErrors({ email: "No account found for this email." });
        showToast?.("No account found for this email.", "error");
      } else if (code === "auth/invalid-email") {
        setFieldErrors({ email: "Please enter a valid email address." });
        showToast?.("Please enter a valid email address.", "error");
      } else if (code === "auth/too-many-requests") {
        setFormError("Too many attempts. Please wait a bit and try again.");
        showToast?.("Too many attempts. Please wait and try again.", "error");
      } else if (code === "auth/invalid-api-key") {
        setFormError(
          "This app’s Firebase API key is missing, wrong, or not allowed for this site. Check VITE_FIREBASE_API_KEY matches Project settings in Firebase Console, and in Google Cloud → Credentials allow this origin on the Browser key.",
        );
        showToast?.("Invalid or blocked Firebase API key.", "error");
      } else if (code === "auth/network-request-failed") {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setFormError("You appear to be offline. Check your connection and try again.");
          showToast?.("You're offline.", "error");
        } else {
          setFormError(
            "Could not reach Firebase Authentication. In DevTools → Network, if signInWithPassword shows HTTP 403, add this origin to Firebase → Authentication → Authorized domains and allow the same origin under your Browser API key’s HTTP referrer restrictions (Google Cloud → Credentials).",
          );
          showToast?.("Can't reach Firebase. If Network shows 403, fix domains + API key.", "error");
        }
      } else if (code === "auth/operation-not-allowed") {
        setFormError("Email/password sign-in is disabled in Firebase Auth for this project.");
        showToast?.("Email/password sign-in is disabled in Firebase Auth.", "error");
      } else if (isFirebaseIdentityToolkitConfigBlock(ex)) {
        setFormError(
          "Sign-in was blocked by Google before your email/password was checked (often HTTP 403). Add this exact origin (scheme + host + port) to Firebase Console → Authentication → Settings → Authorized domains. In Google Cloud Console → APIs & Services → Credentials, open the Browser API key used by this app: allow this origin under Website restrictions and ensure Identity Toolkit API is not blocked.",
        );
        showToast?.("Sign-in blocked (Firebase / Google). Check authorized domains and Browser API key restrictions.", "error");
      } else {
        const fallback = (ex as Error)?.message || "Something went wrong.";
        setFormError(code ? `${fallback} (${code})` : fallback);
        showToast?.(fallback, "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setFieldErrors({});
    if (mode === "signup" && !acceptedTerms) {
      setFieldErrors({ terms: "Accept the Terms and Privacy Policy to continue." });
      return;
    }
    if (isMaintenanceMode()) {
      showToast?.("Sign-in is limited during maintenance.", "error");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        try {
          sessionStorage.setItem(FAN_STOREFRONT_SIGNUP_SESSION_KEY, "1");
        } catch {
          /* ignore */
        }
      }
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      if (freeAccessEnabled) {
        await tryJoinFreeAndUsername("");
      }
      showToast?.("You're in!", "success");
      onSuccess?.();
      onClose();
    } catch (ex: unknown) {
      if (mode === "signup") {
        try {
          sessionStorage.removeItem(FAN_STOREFRONT_SIGNUP_SESSION_KEY);
        } catch {
          /* ignore */
        }
      }
      const code = (ex as { code?: string })?.code;
      logFanAuthError("Google flow failed", ex);
      if (code !== "auth/popup-closed-by-user") {
        if (isFirebaseIdentityToolkitConfigBlock(ex)) {
          setFormError(
            "Google sign-in was blocked by Google before it could finish (often HTTP 403). Add this origin to Firebase Authentication → Authorized domains and allow it on the Browser API key in Google Cloud (Identity Toolkit API).",
          );
          showToast?.("Sign-in blocked (Firebase / Google). Check authorized domains and API key.", "error");
        } else {
          const msg = (ex as Error)?.message || "Google sign-in failed.";
          setFormError(code ? `${msg} (${code})` : msg);
          showToast?.(msg, "error");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    const em = (forgotEmail || email).trim();
    if (!em) {
      showToast?.("Enter your email.", "error");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, em);
      showToast?.("Check your email for a reset link.", "success");
      setForgotOpen(false);
    } catch (ex: unknown) {
      const code = (ex as { code?: string })?.code || "";
      logFanAuthError("password reset failed", ex);
      if (isFirebaseIdentityToolkitConfigBlock(ex)) {
        setFormError(
          "Reset email could not be sent: Firebase blocked the request (often HTTP 403). Check Authorized domains and the Browser API key (referrer restrictions + Identity Toolkit API) in Google Cloud.",
        );
        showToast?.("Password reset blocked (Firebase / Google). Check API key and domains.", "error");
      } else {
        const msg = (ex as Error)?.message || "Could not send reset email.";
        setFormError(code ? `${msg} (${code})` : msg);
        showToast?.("Could not send reset email.", "error");
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fan-auth-overlay" role="dialog" aria-modal="true" aria-labelledby="fan-auth-title">
      <div
        className="fan-auth-card"
        style={{
          fontFamily,
          backgroundColor: cardBackground,
          ["--fan-auth-primary" as string]: primary,
          ["--fan-auth-accent" as string]: accentText,
          ["--fan-auth-soft" as string]: softTint,
          ["--fan-auth-card-bg" as string]: cardBackground,
        }}
      >
        <button type="button" className="fan-auth-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {mark ? (
          <div className="fan-auth-logo-wrap">
            <img src={mark} alt="" className="fan-auth-logo" />
          </div>
        ) : null}
        <h1 id="fan-auth-title" className="fan-auth-title" style={{ color: accentText }}>
          {mode === "login" ? loginTitle : signupTitle}
        </h1>
        <p className="fan-auth-subtitle" style={{ color: `${accentText}aa` }}>
          {mode === "login" ? loginSubtitle : signupSubtitle}
        </p>

        <div className="fan-auth-tabs">
          <button
            type="button"
            className={`fan-auth-tab ${mode === "login" ? "fan-auth-tab--active" : ""}`}
            onClick={() => {
              setMode("login");
              setFormError("");
              setFieldErrors({});
            }}
            style={
              mode === "login"
                ? { backgroundColor: softTint, color: primary, borderColor: primary }
                : { color: accentText, borderColor: `${accentText}33` }
            }
          >
            Log In
          </button>
          <button
            type="button"
            className={`fan-auth-tab ${mode === "signup" ? "fan-auth-tab--active" : ""}`}
            onClick={() => {
              setMode("signup");
              setFormError("");
              setFieldErrors({});
            }}
            style={
              mode === "signup"
                ? { backgroundColor: softTint, color: primary, borderColor: primary }
                : { color: accentText, borderColor: `${accentText}33` }
            }
          >
            Sign Up
          </button>
        </div>

        {forgotOpen && mode === "login" ? (
          <div className="fan-auth-forgot-panel">
            <label className="fan-auth-label" style={{ color: accentText }}>
              Email
            </label>
            <input
              className="fan-auth-input"
              type="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <button
              type="button"
              className="fan-auth-submit"
              style={{ background: `linear-gradient(180deg, ${gradTop} 0%, ${primary} 100%)` }}
              onClick={handleForgot}
              disabled={loading}
            >
              Send reset link
            </button>
            <button type="button" className="fan-auth-text-btn" onClick={() => setForgotOpen(false)}>
              Back to log in
            </button>
          </div>
        ) : (
          <form className="fan-auth-form" onSubmit={handleEmailAuth}>
            {formError ? <p className="fan-auth-err">{formError}</p> : null}
            {mode === "signup" && (
              <>
                <label className="fan-auth-label" style={{ color: accentText }}>
                  Full Name
                </label>
                <input
                  className="fan-auth-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                />
                {fieldErrors.fullName && <p className="fan-auth-err">{fieldErrors.fullName}</p>}
                <label className="fan-auth-label" style={{ color: accentText }}>
                  Username{freeAccessEnabled ? " *" : ""}
                </label>
                {freeAccessEnabled && (
                  <p className="fan-auth-hint">3–32 characters: lowercase letters, numbers, and underscores only.</p>
                )}
                <input
                  className="fan-auth-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="your_handle"
                  autoComplete="username"
                  maxLength={32}
                />
                {fieldErrors.username && <p className="fan-auth-err">{fieldErrors.username}</p>}
              </>
            )}
            <label className="fan-auth-label" style={{ color: accentText }}>
              Email
            </label>
            <input
              className="fan-auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
            {fieldErrors.email && <p className="fan-auth-err">{fieldErrors.email}</p>}
            <label className="fan-auth-label" style={{ color: accentText }}>
              Password
            </label>
            <div className="fan-auth-password-row">
              <input
                className="fan-auth-input fan-auth-input--grow"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                className="fan-auth-show"
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {fieldErrors.password && <p className="fan-auth-err">{fieldErrors.password}</p>}
            {mode === "signup" && (
              <>
                <label className="fan-auth-label" style={{ color: accentText }}>
                  Confirm Password
                </label>
                <div className="fan-auth-password-row">
                  <input
                    className="fan-auth-input fan-auth-input--grow"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="fan-auth-show"
                    onClick={() => setShowConfirmPassword((s) => !s)}
                  >
                    {showConfirmPassword ? "Hide" : "Show"}
                  </button>
                </div>
                {fieldErrors.confirmPassword && <p className="fan-auth-err">{fieldErrors.confirmPassword}</p>}
              </>
            )}
            {mode === "login" && (
              <button type="button" className="fan-auth-text-btn fan-auth-forgot-link" onClick={() => setForgotOpen(true)}>
                Forgot password?
              </button>
            )}
            {mode === "signup" && (
              <label className="fan-auth-check-row">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                />
                <span style={{ color: accentText }}>
                  I agree to the{" "}
                  <a href={termsHref} target="_blank" rel="noopener noreferrer" className="fan-auth-link" style={{ color: primary }}>
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a href={privacyHref} target="_blank" rel="noopener noreferrer" className="fan-auth-link" style={{ color: primary }}>
                    Privacy Policy
                  </a>
                </span>
              </label>
            )}
            {fieldErrors.terms && <p className="fan-auth-err">{fieldErrors.terms}</p>}

            <button
              type="submit"
              className="fan-auth-submit"
              style={{ background: `linear-gradient(180deg, ${gradTop} 0%, ${primary} 100%)` }}
              disabled={loading}
            >
              {loading ? "Please wait…" : mode === "login" ? "Log In" : "Sign Up"}
            </button>

            <div className="fan-auth-divider">
              <span>or</span>
            </div>
            <button
              type="button"
              className="fan-auth-google"
              onClick={handleGoogle}
              disabled={loading}
            >
              <svg className="fan-auth-google-icon" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
