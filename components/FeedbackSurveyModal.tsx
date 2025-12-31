import React, { useMemo, useState } from "react";
import { XIcon } from "./icons/UIIcons";

export type FeedbackMilestone = "day7" | "day14";

type Props = {
  isOpen: boolean;
  milestone: FeedbackMilestone;
  onClose: () => void;
  onSnooze24h: (milestone: FeedbackMilestone) => Promise<void> | void;
  onSubmit: (payload: {
    milestone: FeedbackMilestone;
    answers: Record<string, string>;
    openEnded: Record<string, string>;
  }) => Promise<void> | void;
};

type Question = {
  id: string;
  label: string;
  options: Array<{ value: string; label: string }>;
};

export const FeedbackSurveyModal: React.FC<Props> = ({
  isOpen,
  milestone,
  onClose,
  onSnooze24h,
  onSubmit,
}) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [openEnded, setOpenEnded] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { title, subtitle, questions, openEndedPrompts } = useMemo(() => {
    if (milestone === "day14") {
      return {
        title: "Quick feedback — Day 14",
        subtitle: "2 minutes. Mostly multiple-choice.",
        questions: [
          {
            id: "likelihood_keep_using",
            label: "How likely are you to keep using EchoFlux for planning?",
            options: [
              { value: "definitely", label: "Definitely" },
              { value: "probably", label: "Probably" },
              { value: "not_sure", label: "Not sure yet" },
              { value: "probably_not", label: "Probably not" },
              { value: "definitely_not", label: "Definitely not" },
            ],
          },
          {
            id: "workflow_improve_first",
            label: "What should we improve first?",
            options: [
              { value: "strategy", label: "Strategy" },
              { value: "calendar", label: "Calendar" },
              { value: "compose", label: "Compose" },
              { value: "media", label: "Media Library" },
            ],
          },
          {
            id: "must_have_feature",
            label: "What would make EchoFlux feel “must-have” for you?",
            options: [
              { value: "better_strategy_outputs", label: "Better strategy outputs" },
              { value: "better_calendar_workflows", label: "Better calendar workflows" },
              { value: "better_compose_outputs", label: "Better caption/compose outputs" },
              { value: "analytics", label: "Analytics" },
              { value: "auto_posting", label: "Auto-posting" },
              { value: "other", label: "Other" },
            ],
          },
          {
            id: "overall_experience",
            label: "Overall experience so far:",
            options: [
              { value: "excellent", label: "Excellent" },
              { value: "good", label: "Good" },
              { value: "okay", label: "Okay" },
              { value: "poor", label: "Poor" },
              { value: "very_poor", label: "Very poor" },
            ],
          },
        ] satisfies Question[],
        openEndedPrompts: [
          {
            id: "one_change",
            label: "One thing we should change next (1–2 sentences):",
            placeholder: "Example: Make it easier to move strategy ideas into the calendar…",
          },
        ],
      };
    }

    return {
      title: "Quick feedback — Day 7",
      subtitle: "2 minutes. Mostly multiple-choice.",
      questions: [
        {
          id: "first_workflow_tried",
          label: "Which workflow did you try first?",
          options: [
            { value: "strategy", label: "Strategy" },
            { value: "calendar", label: "Calendar" },
            { value: "compose", label: "Compose" },
            { value: "media", label: "Media Library" },
            { value: "not_sure", label: "Not sure yet" },
          ],
        },
        {
          id: "ease_of_next_step",
          label: "How easy was it to understand what to do next?",
          options: [
            { value: "very_easy", label: "Very easy" },
            { value: "mostly_easy", label: "Mostly easy" },
            { value: "neutral", label: "Neutral" },
            { value: "somewhat_confusing", label: "Somewhat confusing" },
            { value: "very_confusing", label: "Very confusing" },
          ],
        },
        {
          id: "most_useful",
          label: "What’s been the most useful so far?",
          options: [
            { value: "strategy_generation", label: "Strategy generation" },
            { value: "calendar_planning", label: "Calendar planning" },
            { value: "compose", label: "Compose / captions" },
            { value: "media_organization", label: "Media organization" },
            { value: "no_value_yet", label: "I haven’t found value yet" },
          ],
        },
        {
          id: "improve_first",
          label: "What should we improve first?",
          options: [
            { value: "navigation", label: "Navigation / layout" },
            { value: "clarity", label: "Clarity of steps / instructions" },
            { value: "speed", label: "Speed / performance" },
            { value: "output_quality", label: "Output quality (strategy/captions)" },
            { value: "media_workflow", label: "Media workflow" },
          ],
        },
      ] satisfies Question[],
      openEndedPrompts: [
        {
          id: "could_not_figure_out",
          label: "What’s one thing you wanted to do but couldn’t figure out? (1–2 sentences):",
          placeholder: "Example: I wanted to… but couldn’t find where…",
        },
      ],
    };
  }, [milestone]);

  if (!isOpen) return null;

  const allAnswered = questions.every((q) => typeof answers[q.id] === "string" && answers[q.id].trim());

  async function handleSubmit() {
    setError(null);
    if (!allAnswered) {
      setError("Please answer all multiple-choice questions.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ milestone, answers, openEnded });
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to submit feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Close"
          >
            <XIcon />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          {questions.map((q) => (
            <div key={q.id} className="space-y-3">
              <div className="text-sm font-semibold text-gray-900 dark:text-white">{q.label}</div>
              <div className="space-y-2">
                {q.options.map((opt) => {
                  const checked = answers[q.id] === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        checked
                          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                          : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        value={opt.value}
                        checked={checked}
                        onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.value }))}
                      />
                      <span className="text-sm text-gray-800 dark:text-gray-200">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          {openEndedPrompts.map((p) => (
            <div key={p.id} className="space-y-2">
              <div className="text-sm font-semibold text-gray-900 dark:text-white">{p.label}</div>
              <textarea
                value={openEnded[p.id] || ""}
                onChange={(e) => setOpenEnded((prev) => ({ ...prev, [p.id]: e.target.value }))}
                placeholder={p.placeholder}
                className="w-full min-h-[110px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-3 text-sm"
              />
            </div>
          ))}

          {error ? (
            <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
          ) : null}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
            <button
              onClick={() => onSnooze24h(milestone)}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Remind me in 24h
            </button>
            <div className="flex gap-3 justify-end">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Not now
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-6 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-60"
              >
                {isSubmitting ? "Submitting…" : "Submit feedback"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


