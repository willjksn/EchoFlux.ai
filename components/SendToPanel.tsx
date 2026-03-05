import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { db } from '../firebaseConfig';
import {
  sendToDraft,
  sendToScheduledPost,
  sendToDrop,
  sendToMessageCampaign,
  type SendToDraftPayload,
  type SendToScheduledPayload,
  type SendToDropPayload,
  type SendToMessageCampaignPayload,
  type DropVisibility,
} from '../src/services/premiumStudioSendTo';
import { SendIcon, FileIcon, CalendarIcon, SparklesIcon, ChatIcon } from './icons/UIIcons';

export type SendToPanelPayload = {
  content: string;
  mediaUrls?: string[];
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  author?: { name: string; avatar: string };
  /** For Message Campaign: sequence of messages. If not set, content is used as single message. */
  messages?: string[];
};

type SendTarget = 'draft' | 'scheduled' | 'drop' | 'messageCampaign';

interface SendToPanelProps {
  payload: SendToPanelPayload;
  onSent?: (target: SendTarget) => void;
  className?: string;
}

const VISIBILITY_OPTIONS: { value: DropVisibility; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'subscriber', label: 'Subscriber only' },
  { value: 'locked', label: 'Locked (PPV)' },
];

export const SendToPanel: React.FC<SendToPanelProps> = ({ payload, onSent, className = '' }) => {
  const { user, setActivePage, showToast } = useAppContext();
  const [sending, setSending] = useState<SendTarget | null>(null);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('12:00');
  const [visibility, setVisibility] = useState<DropVisibility>('subscriber');
  const [lockedPrice, setLockedPrice] = useState<string>('4.99');
  const [campaignName, setCampaignName] = useState('');

  const handleSend = async (target: SendTarget) => {
    if (!user?.id) {
      showToast?.('You must be signed in to send.', 'error');
      return;
    }
    setSending(target);
    try {
      switch (target) {
        case 'draft': {
          const draftPayload: SendToDraftPayload = {
            content: payload.content,
            mediaUrls: payload.mediaUrls,
            mediaUrl: payload.mediaUrl,
            mediaType: payload.mediaType,
            author: payload.author,
          };
          await sendToDraft(db, user.id, draftPayload);
          showToast?.('Saved to Compose drafts.', 'success');
          setActivePage('compose');
          if (typeof window !== 'undefined') {
            window.history.pushState({}, '', '/compose/drafts');
          }
          onSent?.('draft');
          break;
        }
        case 'scheduled': {
          const dateStr = scheduledDate ? `${scheduledDate}T${scheduledTime}:00.000Z` : new Date(Date.now() + 86400000).toISOString();
          const sPayload: SendToScheduledPayload = {
            content: payload.content,
            mediaUrls: payload.mediaUrls,
            mediaUrl: payload.mediaUrl,
            mediaType: payload.mediaType,
            author: payload.author,
            scheduledDate: dateStr,
            title: 'Scheduled post',
          };
          await sendToScheduledPost(db, user.id, sPayload);
          showToast?.('Added to Calendar.', 'success');
          setActivePage('calendar');
          onSent?.('scheduled');
          break;
        }
        case 'drop': {
          const dropPayload: SendToDropPayload = {
            content: payload.content,
            mediaUrls: payload.mediaUrls,
            mediaUrl: payload.mediaUrl,
            visibility,
            lockedPrice: visibility === 'locked' ? parseFloat(lockedPrice) || 0 : undefined,
            title: 'Drop',
          };
          await sendToDrop(db, user.id, dropPayload);
          showToast?.('Added to Fan Hub Feed.', 'success');
          setActivePage('fanHub');
          if (typeof window !== 'undefined') {
            window.history.pushState({}, '', '/fan?tab=myPage');
          }
          onSent?.('drop');
          break;
        }
        case 'messageCampaign': {
          const messages = payload.messages?.length ? payload.messages : [payload.content];
          const campaignPayload: SendToMessageCampaignPayload = {
            name: campaignName.trim() || undefined,
            messages,
          };
          await sendToMessageCampaign(db, user.id, campaignPayload);
          showToast?.('Message campaign saved. Ready in Fan Hub Messages.', 'success');
          setActivePage('onlyfansStudio');
          if (typeof window !== 'undefined') {
            window.history.pushState({}, '', '/studio?tab=messages');
          }
          onSent?.('messageCampaign');
          break;
        }
      }
    } catch (e: any) {
      showToast?.(e?.message || 'Failed to send.', 'error');
    } finally {
      setSending(null);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <SendIcon className="w-4 h-4 text-primary-600 dark:text-primary-400" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Send To</h3>
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleSend('draft')}
            disabled={!!sending || !payload.content.trim()}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <FileIcon className="w-4 h-4" />
            Draft → Compose
          </button>
          <button
            type="button"
            onClick={() => handleSend('scheduled')}
            disabled={!!sending || !payload.content.trim()}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <CalendarIcon className="w-4 h-4" />
            Scheduled → Calendar
          </button>
          <button
            type="button"
            onClick={() => handleSend('drop')}
            disabled={!!sending || !payload.content.trim()}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <SparklesIcon className="w-4 h-4" />
            Drop → Feed
          </button>
          <button
            type="button"
            onClick={() => handleSend('messageCampaign')}
            disabled={!!sending || (!payload.content.trim() && !(payload.messages?.length))}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <ChatIcon className="w-4 h-4" />
            Message Campaign
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <span>Date</span>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              min={today}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <span>Time</span>
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <span>Visibility</span>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as DropVisibility)}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1"
            >
              {VISIBILITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          {visibility === 'locked' && (
            <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <span>Price ($)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={lockedPrice}
                onChange={(e) => setLockedPrice(e.target.value)}
                className="w-20 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1"
              />
            </label>
          )}
        </div>

        <div className="text-sm">
          <label className="block text-gray-600 dark:text-gray-400 mb-1">Campaign name (optional)</label>
          <input
            type="text"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="e.g. Welcome sequence"
            className="w-full max-w-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1"
          />
        </div>

        {sending && (
          <p className="text-xs text-gray-500 dark:text-gray-400">Sending…</p>
        )}
      </div>
    </div>
  );
};
