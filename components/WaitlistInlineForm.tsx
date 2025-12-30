import React, { useState } from 'react';
import { isInviteOnlyMode } from '../src/utils/inviteOnly';

export const WaitlistInlineForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'validating' | 'valid' | 'done'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [inviteDetails, setInviteDetails] = useState<{ plan: string; expiresAt: string | null } | null>(null);
  const inviteOnly = isInviteOnlyMode();

  // Waitlist form submission (when invite-only mode is ON)
  const submitWaitlist = async () => {
    if (!email.trim()) {
      setMessage('Email is required.');
      return;
    }
    setStatus('loading');
    setMessage(null);
    try {
      const resp = await fetch('/api/joinWaitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setMessage(data?.error || 'Failed to join.');
        setStatus('idle');
        return;
      }
      setMessage(data?.message || 'You're on the list.');
      setStatus('done');
    } catch {
      setMessage('Failed to join.');
      setStatus('idle');
    }
  };

  // Invite code validation (when waitlist is OFF)
  const validateInviteCode = async () => {
    if (!inviteCode.trim()) {
      setMessage('Invite code is required.');
      return;
    }
    if (!acceptedTerms) {
      setMessage('You must accept the Terms of Service and Privacy Policy.');
      return;
    }
    setStatus('validating');
    setMessage(null);
    try {
      const resp = await fetch('/api/validateInviteCode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: inviteCode.trim().toUpperCase() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!data?.valid) {
        setMessage(data?.error || 'Invalid invite code.');
        setStatus('idle');
        return;
      }
      // Store invite code in localStorage for signup flow
      localStorage.setItem('pendingInviteCode', inviteCode.trim().toUpperCase());
      setInviteDetails({ plan: data.grantPlan, expiresAt: data.expiresAt });
      setStatus('valid');
      setMessage('Invite code validated! Click "Get Started" to sign up.');
    } catch {
      setMessage('Failed to validate invite code.');
      setStatus('idle');
    }
  };

  // Show waitlist form when invite-only mode is ON
  if (inviteOnly) {
    return (
      <div className="mt-4 rounded-xl border border-white/20 bg-white/10 backdrop-blur p-4 text-white">
        <div className="font-semibold">Invite-only right now</div>
        <div className="text-sm text-white/80 mt-1">
          Join the waitlist and we'll email you if you're selected.
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className="w-full rounded-md px-3 py-2 bg-white/10 border border-white/20 placeholder-white/50 text-white focus:outline-none focus:ring-2 focus:ring-white/30"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-md px-3 py-2 bg-white/10 border border-white/20 placeholder-white/50 text-white focus:outline-none focus:ring-2 focus:ring-white/30"
          />
          <button
            type="button"
            onClick={submitWaitlist}
            disabled={status === 'loading' || status === 'done'}
            className="rounded-md px-4 py-2 bg-white text-primary-700 font-semibold hover:bg-primary-50 disabled:opacity-70"
          >
            {status === 'loading' ? 'Submitting…' : status === 'done' ? 'Submitted' : 'Join waitlist'}
          </button>
        </div>
        {message && <div className="mt-2 text-sm text-white/90">{message}</div>}
      </div>
    );
  }

  // Show invite code form when waitlist is OFF
  return (
    <div className="mt-4 rounded-xl border border-white/20 bg-white/10 backdrop-blur p-4 text-white">
      <div className="font-semibold">Have an invite code? Try EchoFlux.ai out</div>
      <div className="text-sm text-white/80 mt-1">
        Enter your invite code to get started. You'll be able to sign up and start using the app right away.
      </div>
      <div className="mt-3 space-y-3">
        <input
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 9))}
          placeholder="XXXX-XXXX"
          className="w-full rounded-md px-3 py-2 bg-white/10 border border-white/20 placeholder-white/50 text-white focus:outline-none focus:ring-2 focus:ring-white/30"
        />
        <div className="flex items-start">
          <input
            type="checkbox"
            id="acceptTerms"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-1 mr-2 h-4 w-4 rounded border-white/20 bg-white/10 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="acceptTerms" className="text-sm text-white/90">
            I accept the{' '}
            <a href="/terms" target="_blank" className="underline hover:text-white">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy" target="_blank" className="underline hover:text-white">
              Privacy Policy
            </a>
          </label>
        </div>
        <button
          type="button"
          onClick={validateInviteCode}
          disabled={status === 'validating' || status === 'valid' || !acceptedTerms}
          className="w-full rounded-md px-4 py-2 bg-white text-primary-700 font-semibold hover:bg-primary-50 disabled:opacity-70"
        >
          {status === 'validating' ? 'Validating…' : status === 'valid' ? 'Valid! Click Get Started' : 'Validate Invite Code'}
        </button>
      </div>
      {inviteDetails && status === 'valid' && (
        <div className="mt-3 p-3 bg-green-500/20 border border-green-500/30 rounded-md">
          <div className="text-sm text-white">
            <strong>Plan:</strong> {inviteDetails.plan}
            {inviteDetails.expiresAt && (
              <>
                <br />
                <strong>Expires:</strong> {new Date(inviteDetails.expiresAt).toLocaleDateString()}
              </>
            )}
          </div>
        </div>
      )}
      {message && <div className={`mt-2 text-sm ${status === 'valid' ? 'text-green-300' : 'text-white/90'}`}>{message}</div>}
    </div>
  );
};
