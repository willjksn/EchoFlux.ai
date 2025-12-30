import React, { useState } from 'react';
import { isInviteOnlyMode } from '../src/utils/inviteOnly';

export const WaitlistInlineForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const inviteOnly = isInviteOnlyMode();

  // Only show waitlist CTA during invite-only periods
  if (!inviteOnly) return null;

  const submit = async () => {
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
      setMessage(data?.message || 'You’re on the list.');
      setStatus('done');
    } catch {
      setMessage('Failed to join.');
      setStatus('idle');
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-white/20 bg-white/10 backdrop-blur p-4 text-white">
      <div className="font-semibold">Invite-only right now</div>
      <div className="text-sm text-white/80 mt-1">
        Join the waitlist and we’ll email you if you’re selected.
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
          onClick={submit}
          disabled={status === 'loading' || status === 'done'}
          className="rounded-md px-4 py-2 bg-white text-primary-700 font-semibold hover:bg-primary-50 disabled:opacity-70"
        >
          {status === 'loading' ? 'Submitting…' : status === 'done' ? 'Submitted' : 'Join waitlist'}
        </button>
      </div>
      {message && <div className="mt-2 text-sm text-white/90">{message}</div>}
    </div>
  );
};


