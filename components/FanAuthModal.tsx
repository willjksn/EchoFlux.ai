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
import "../styles/fan-auth-modal.css";

const DEFAULT_FAN_AUTH_PRIMARY = "#d9468c";
const DEFAULT_FAN_AUTH_ACCENT = "#4a2c2c";
/** Tab / chip tint when creator has not set `fanAuthBranding.softTint` */
const DEFAULT_FAN_AUTH_SOFT = "#fdf2f7";
/** Card surface when theme is still default indigo — light pink (Stormij-style), not cream */
const DEFAULT_FAN_AUTH_CARD_BG = "#fff2f8";
const BUILTIN_DEFAULT_PRIMARY = "#6366f1";

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
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialView);
    setFieldErrors({});
    setForgotOpen(false);
  }, [initialView, isOpen]);

  const community =
    branding?.communityName?.trim() ||
    `${displayName || "This creator"}'s member area`;

  const useIndigoDefault = !branding?.primaryColor && (!themePrimary || themePrimary === BUILTIN_DEFAULT_PRIMARY);
  const primary = branding?.primaryColor ?? (useIndigoDefault ? DEFAULT_FAN_AUTH_PRIMARY : themePrimary ?? DEFAULT_FAN_AUTH_PRIMARY);
  const accentText = branding?.accentTextColor ?? themeText ?? DEFAULT_FAN_AUTH_ACCENT;
  /** Tabs / active chip — custom `softTint`, else pink default for indigo, else subtle tint from theme primary */
  const softTint =
    branding?.softTint ??
    (useIndigoDefault ? DEFAULT_FAN_AUTH_SOFT : lightenHex(themePrimary ?? BUILTIN_DEFAULT_PRIMARY, 0.88));
  /**
   * Modal card background: custom `softTint` if set (same key as My Page “modal tint”).
   * Otherwise light pink when storefront still uses default indigo; subtle primary tint when they picked a theme;
   * never the old cream #fffef9.
   */
  const cardBackground =
    branding?.softTint ??
    (useIndigoDefault
      ? DEFAULT_FAN_AUTH_CARD_BG
      : lightenHex(themePrimary ?? BUILTIN_DEFAULT_PRIMARY, 0.93));
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
    const token = await auth.currentUser.getIdToken(true);
    const join = await fetch("/api/joinFreeMembership", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ creatorId }),
    });
    const joinData = await join.json().catch(() => ({}));
    if (!join.ok) {
      showToast?.((joinData as { error?: string }).error || "Could not join free membership.", "error");
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
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
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
        return;
      }

      try {
        const methods = await fetchSignInMethodsForEmail(auth, email.trim());
        if (methods.length > 0) {
          showToast?.("This email is already registered. Log in instead.", "error");
          setMode("login");
          return;
        }
      } catch {
        /* continue */
      }

      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: fullName.trim() });
      await tryJoinFreeAndUsername(username);
      showToast?.("Account created!", "success");
      onClose();
    } catch (ex: unknown) {
      const code = (ex as { code?: string })?.code || "";
      if (code === "auth/email-already-in-use") {
        showToast?.("Email already in use. Try logging in.", "error");
        setMode("login");
      } else if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        setFieldErrors({ password: "Incorrect email or password." });
      } else {
        showToast?.((ex as Error)?.message || "Something went wrong.", "error");
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
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      if (freeAccessEnabled) {
        await tryJoinFreeAndUsername("");
      }
      showToast?.("You're in!", "success");
      onClose();
    } catch (ex: unknown) {
      const code = (ex as { code?: string })?.code;
      if (code !== "auth/popup-closed-by-user") {
        showToast?.((ex as Error)?.message || "Google sign-in failed.", "error");
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
    } catch {
      showToast?.("Could not send reset email.", "error");
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
            onClick={() => setMode("login")}
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
            onClick={() => setMode("signup")}
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
