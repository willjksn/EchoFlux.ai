import React, { useState } from "react";
import { XIcon } from "./icons/UIIcons";
import { auth } from "../firebaseConfig";

interface Question {
  id: string;
  type: 'open-ended' | 'multiple-choice';
  text: string;
  options?: string[];
  required: boolean;
}

interface FeedbackForm {
  id: string;
  title: string;
  description: string;
  questions: Question[];
}

type Props = {
  isOpen: boolean;
  form: FeedbackForm | null;
  onClose: () => void;
  onSubmit: () => void;
};

export const CustomFeedbackFormModal: React.FC<Props> = ({
  isOpen,
  form,
  onClose,
  onSubmit,
}) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [openEnded, setOpenEnded] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !form) return null;

  const handleSubmit = async () => {
    // Validate required questions
    for (const q of form.questions) {
      if (q.required) {
        if (q.type === 'multiple-choice' && !answers[q.id]) {
          setError(`Please answer: ${q.text}`);
          return;
        }
        if (q.type === 'open-ended' && !openEnded[q.id]?.trim()) {
          setError(`Please answer: ${q.text}`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      if (!token) {
        throw new Error('Please sign in again to submit feedback.');
      }

      const res = await fetch('/api/submitCustomFeedbackForm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          formId: form.id,
          answers,
          openEnded,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to submit feedback');
      }

      onSubmit();
      onClose();
      
      // Reset form
      setAnswers({});
      setOpenEnded({});
    } catch (e: any) {
      console.error('Failed to submit feedback:', e);
      setError(e?.message || 'Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {form.title}
            </h2>
            {form.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {form.description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <XIcon />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {form.questions.map((q, idx) => (
            <div key={q.id} className="space-y-2">
              <label className="block text-sm font-medium text-gray-900 dark:text-white">
                {q.text}
                {q.required && <span className="text-red-500 ml-1">*</span>}
              </label>

              {q.type === 'multiple-choice' && q.options ? (
                <div className="space-y-2">
                  {q.options.map((option, optIdx) => (
                    <label
                      key={optIdx}
                      className="flex items-center p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-900 cursor-pointer transition-colors"
                    >
                      <input
                        type="radio"
                        name={q.id}
                        value={option}
                        checked={answers[q.id] === option}
                        onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                        className="mr-3 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{option}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  value={openEnded[q.id] || ''}
                  onChange={(e) => setOpenEnded({ ...openEnded, [q.id]: e.target.value })}
                  placeholder="Your answer..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-primary-500 focus:border-primary-500"
                />
              )}
            </div>
          ))}

          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

