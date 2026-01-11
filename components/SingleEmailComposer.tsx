import React, { useMemo, useState } from 'react';
import { auth } from '../firebaseConfig';
import { useAppContext } from './AppContext';
import { dateInputToIsoEndOfDay } from '../src/utils/dateInput';

type InvitePlan = 'Free' | 'Pro' | 'Elite';

export const SingleEmailComposer: React.FC = () => {
  const { showToast } = useAppContext();
  const [to, setTo] = useState('');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);

  const [includeInvite, setIncludeInvite] = useState(false);
  const [invitePlan, setInvitePlan] = useState<InvitePlan>('Free');
  const [inviteMaxUses, setInviteMaxUses] = useState<number>(1);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string>(''); // YYYY-MM-DD
  
  // AI Email Generation
  const [aiInstructions, setAiInstructions] = useState('');
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [showAiGenerator, setShowAiGenerator] = useState(false);
  const [emailTone, setEmailTone] = useState<'professional' | 'friendly' | 'casual' | 'formal' | 'enthusiastic'>('professional');

  const canSend = useMemo(() => {
    return to.trim() && subject.trim() && text.trim() && !isSending;
  }, [to, subject, text, isSending]);

  const handleSend = async () => {
    if (!to.trim() || !subject.trim() || !text.trim()) {
      showToast('To, subject, and message are required', 'error');
      return;
    }

    setIsSending(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch('/api/adminSendSingleEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: to.trim(),
          name: name.trim() || null,
          subject: subject.trim(),
          text: text.trim(),
          createInvite: includeInvite
            ? {
                enabled: true,
                grantPlan: invitePlan,
                maxUses: inviteMaxUses,
                expiresAt: inviteExpiresAt ? dateInputToIsoEndOfDay(inviteExpiresAt) : null,
              }
            : { enabled: false },
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'Failed to send email');

      if (data.inviteCode) {
        showToast(`Email sent. Invite code: ${data.inviteCode}`, 'success');
      } else {
        showToast('Email sent.', 'success');
      }

      // Keep subject/body for convenience; clear recipient/name.
      setTo('');
      setName('');
    } catch (e: any) {
      showToast(e?.message || 'Failed to send email', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const generateEmailWithAI = async () => {
    if (!aiInstructions.trim()) {
      showToast('Please describe what you want in the email', 'error');
      return;
    }

    setIsGeneratingEmail(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch('/api/generateEmailContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          instructions: aiInstructions.trim(),
          emailType: 'single',
          recipientName: name.trim() || undefined,
          tone: emailTone,
          includePlaceholders: true,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        throw new Error(data.error || data.note || 'Failed to generate email');
      }

      setSubject(data.subject || '');
      setText(data.body || '');
      setShowAiGenerator(false);
      setAiInstructions('');
      showToast('Email generated successfully! Review and edit as needed.', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to generate email', 'error');
    } finally {
      setIsGeneratingEmail(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 space-y-5">
      <div>
        <div className="text-lg font-semibold text-gray-900 dark:text-white">Send an email</div>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Single-recipient email. Optional placeholders: {'{name}'}, {'{inviteCode}'}, {'{plan}'}, {'{expiresAt}'}, {'{onboardingLink}'}.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To</label>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="email@example.com"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name (optional)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First name"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      {/* AI Email Generator */}
      <div className="border border-primary-200 dark:border-primary-800 rounded-lg p-4 bg-primary-50 dark:bg-primary-900/20">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">✨ AI Email Generator</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Describe what you want to say, and AI will write the email for you
            </p>
          </div>
          <button
            onClick={() => setShowAiGenerator(!showAiGenerator)}
            className="px-3 py-1 text-xs rounded-md bg-primary-600 text-white hover:bg-primary-700"
          >
            {showAiGenerator ? 'Hide' : 'Generate with AI'}
          </button>
        </div>

        {showAiGenerator && (
          <div className="space-y-3 mt-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                What should this email say?
              </label>
              <textarea
                value={aiInstructions}
                onChange={(e) => setAiInstructions(e.target.value)}
                placeholder="e.g., 'Welcome new users to EchoFlux and explain the key features' or 'Send a thank you email to Pro plan users'"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tone
              </label>
              <select
                value={emailTone}
                onChange={(e) => setEmailTone(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="casual">Casual</option>
                <option value="formal">Formal</option>
                <option value="enthusiastic">Enthusiastic</option>
              </select>
            </div>
            <button
              onClick={generateEmailWithAI}
              disabled={isGeneratingEmail || !aiInstructions.trim()}
              className="w-full px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {isGeneratingEmail ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                  Generating...
                </span>
              ) : (
                '✨ Generate Email'
              )}
            </button>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject line"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder="Write your email here…"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
        />
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <input
            id="includeInvite"
            type="checkbox"
            checked={includeInvite}
            onChange={(e) => setIncludeInvite(e.target.checked)}
            className="h-4 w-4"
          />
          <label htmlFor="includeInvite" className="text-sm text-gray-700 dark:text-gray-300">
            Generate an invite code and include it in the email
          </label>
        </div>

        {includeInvite && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Plan</label>
              <select
                value={invitePlan}
                onChange={(e) => setInvitePlan(e.target.value as InvitePlan)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              >
                <option value="Free">Free</option>
                <option value="Pro">Pro</option>
                <option value="Elite">Elite</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max uses</label>
              <input
                type="number"
                min={1}
                max={100}
                value={inviteMaxUses}
                onChange={(e) => setInviteMaxUses(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Expires (optional)</label>
              <input
                type="date"
                value={inviteExpiresAt}
                onChange={(e) => setInviteExpiresAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {isSending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
};


