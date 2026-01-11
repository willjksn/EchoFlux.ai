import React, { useState, useEffect } from 'react';
import { auth } from '../firebaseConfig';
import { useAppContext } from './AppContext';

interface Question {
  id: string;
  type: 'open-ended' | 'multiple-choice';
  text: string;
  options?: string[]; // For multiple choice
  required: boolean;
  reasoning?: string; // AI-generated reasoning
}

interface FeedbackForm {
  id?: string;
  title: string;
  description: string;
  questions: Question[];
  targetAudience: 'all' | 'invite_grant' | 'specific_plan';
  specificPlan?: string;
  scheduleType: 'immediate' | 'scheduled';
  scheduledDate?: string;
  scheduledTime?: string;
  createdAt?: string;
  status?: 'draft' | 'active' | 'sent' | 'closed';
  responsesCount?: number;
}

export const AdminFeedbackFormBuilder: React.FC = () => {
  const { showToast } = useAppContext();
  const [forms, setForms] = useState<FeedbackForm[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showFormBuilder, setShowFormBuilder] = useState(false);
  const [editingForm, setEditingForm] = useState<FeedbackForm | null>(null);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
  const [showGeneratedQuestions, setShowGeneratedQuestions] = useState(false);
  const [usageStats, setUsageStats] = useState<any>(null);

  const [formData, setFormData] = useState<FeedbackForm>({
    title: '',
    description: '',
    questions: [],
    targetAudience: 'all',
    scheduleType: 'immediate',
    status: 'draft',
  });

  useEffect(() => {
    fetchForms();
  }, []);

  const fetchForms = async () => {
    setIsLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch('/api/adminGetFeedbackForms', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch forms');
      }

      setForms(data.forms || []);
    } catch (err: any) {
      console.error('Failed to fetch forms:', err);
      showToast(err?.message || 'Failed to fetch forms', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const addQuestion = (type: 'open-ended' | 'multiple-choice') => {
    const newQuestion: Question = {
      id: Date.now().toString(),
      type,
      text: '',
      options: type === 'multiple-choice' ? [''] : undefined,
      required: false,
    };
    setFormData({
      ...formData,
      questions: [...formData.questions, newQuestion],
    });
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setFormData({
      ...formData,
      questions: formData.questions.map(q =>
        q.id === id ? { ...q, ...updates } : q
      ),
    });
  };

  const removeQuestion = (id: string) => {
    setFormData({
      ...formData,
      questions: formData.questions.filter(q => q.id !== id),
    });
  };

  const addOption = (questionId: string) => {
    setFormData({
      ...formData,
      questions: formData.questions.map(q =>
        q.id === questionId
          ? { ...q, options: [...(q.options || []), ''] }
          : q
      ),
    });
  };

  const updateOption = (questionId: string, optionIndex: number, value: string) => {
    setFormData({
      ...formData,
      questions: formData.questions.map(q =>
        q.id === questionId
          ? {
              ...q,
              options: q.options?.map((opt, idx) => idx === optionIndex ? value : opt),
            }
          : q
      ),
    });
  };

  const removeOption = (questionId: string, optionIndex: number) => {
    setFormData({
      ...formData,
      questions: formData.questions.map(q =>
        q.id === questionId
          ? {
              ...q,
              options: q.options?.filter((_, idx) => idx !== optionIndex),
            }
          : q
      ),
    });
  };

  const saveForm = async () => {
    if (!formData.title.trim()) {
      showToast('Please enter a form title', 'error');
      return;
    }

    if (formData.questions.length === 0) {
      showToast('Please add at least one question', 'error');
      return;
    }

    // Validate questions
    for (const q of formData.questions) {
      if (!q.text.trim()) {
        showToast('All questions must have text', 'error');
        return;
      }
      if (q.type === 'multiple-choice' && (!q.options || q.options.length < 2 || q.options.some(opt => !opt.trim()))) {
        showToast('Multiple choice questions must have at least 2 options', 'error');
        return;
      }
    }

    setIsLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch('/api/adminCreateFeedbackForm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...formData,
          id: editingForm?.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save form');
      }

      showToast(editingForm ? 'Form updated successfully' : 'Form created successfully', 'success');
      setShowFormBuilder(false);
      setEditingForm(null);
      setFormData({
        title: '',
        description: '',
        questions: [],
        targetAudience: 'all',
        scheduleType: 'immediate',
        status: 'draft',
      });
      fetchForms();
    } catch (err: any) {
      console.error('Failed to save form:', err);
      showToast(err?.message || 'Failed to save form', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const sendForm = async (formId: string) => {
    if (!window.confirm('Send this feedback form to the selected audience now?')) {
      return;
    }

    setIsLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch('/api/adminSendFeedbackForm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ formId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send form');
      }

      showToast(`Form sent to ${data.sentCount} users`, 'success');
      fetchForms();
    } catch (err: any) {
      console.error('Failed to send form:', err);
      showToast(err?.message || 'Failed to send form', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const editForm = (form: FeedbackForm) => {
    setEditingForm(form);
    setFormData(form);
    setShowFormBuilder(true);
  };

  const startNewForm = () => {
    setEditingForm(null);
    setFormData({
      title: '',
      description: '',
      questions: [],
      targetAudience: 'all',
      scheduleType: 'immediate',
      status: 'draft',
    });
    setShowFormBuilder(true);
    setGeneratedQuestions([]);
    setUsageStats(null);
  };

  const generateQuestionsWithAI = async () => {
    setIsGeneratingQuestions(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch('/api/generateFeedbackQuestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          formPurpose: formData.description || formData.title || undefined,
          targetAudience: formData.targetAudience,
          specificPlan: formData.targetAudience === 'specific_plan' ? formData.specificPlan : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.note || 'Failed to generate questions');
      }

      setGeneratedQuestions(data.questions || []);
      setUsageStats(data.usageStats || null);
      setShowGeneratedQuestions(true);
      showToast(`Generated ${data.questions?.length || 0} questions based on usage data`, 'success');
    } catch (err: any) {
      console.error('Failed to generate questions:', err);
      showToast(err?.message || 'Failed to generate questions', 'error');
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  const addGeneratedQuestion = (question: Question) => {
    setFormData({
      ...formData,
      questions: [...formData.questions, question],
    });
    setGeneratedQuestions(generatedQuestions.filter(q => q.id !== question.id));
    if (generatedQuestions.length === 1) {
      setShowGeneratedQuestions(false);
    }
  };

  const addAllGeneratedQuestions = () => {
    setFormData({
      ...formData,
      questions: [...formData.questions, ...generatedQuestions],
    });
    setGeneratedQuestions([]);
    setShowGeneratedQuestions(false);
    showToast(`Added ${generatedQuestions.length} questions to form`, 'success');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Feedback Form Builder</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Create and send custom feedback forms to users on demand or schedule
            </p>
          </div>
          <button
            onClick={startNewForm}
            className="px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700"
          >
            + New Form
          </button>
        </div>

        {/* Forms List */}
        {isLoading && forms.length === 0 ? (
          <div className="text-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading forms...</p>
          </div>
        ) : forms.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>No feedback forms created yet</p>
            <button
              onClick={startNewForm}
              className="mt-4 px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700"
            >
              Create Your First Form
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {forms.map((form) => (
              <div
                key={form.id}
                className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-semibold text-gray-900 dark:text-white">{form.title}</h4>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        form.status === 'sent' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                        form.status === 'active' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {form.status}
                      </span>
                      {form.responsesCount !== undefined && (
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {form.responsesCount} responses
                        </span>
                      )}
                    </div>
                    {form.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{form.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>{form.questions.length} questions</span>
                      <span>Target: {form.targetAudience}</span>
                      {form.createdAt && (
                        <span>Created: {new Date(form.createdAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => editForm(form)}
                      className="px-3 py-1 text-sm rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                    >
                      Edit
                    </button>
                    {form.status !== 'sent' && (
                      <button
                        onClick={() => sendForm(form.id!)}
                        disabled={isLoading}
                        className="px-3 py-1 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        Send
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form Builder Modal */}
      {showFormBuilder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingForm ? 'Edit Feedback Form' : 'Create Feedback Form'}
                </h3>
                <button
                  onClick={() => {
                    setShowFormBuilder(false);
                    setEditingForm(null);
                    setFormData({
                      title: '',
                      description: '',
                      questions: [],
                      targetAudience: 'all',
                      scheduleType: 'immediate',
                      status: 'draft',
                    });
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                {/* Basic Info */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Form Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g., Product Feature Feedback"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    rows={3}
                    placeholder="Optional description for the form"
                  />
                </div>

                {/* Target Audience */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Target Audience
                  </label>
                  <select
                    value={formData.targetAudience}
                    onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="all">All Users</option>
                    <option value="invite_grant">Invite Grant Users Only</option>
                    <option value="specific_plan">Specific Plan</option>
                  </select>
                  {formData.targetAudience === 'specific_plan' && (
                    <input
                      type="text"
                      value={formData.specificPlan || ''}
                      onChange={(e) => setFormData({ ...formData, specificPlan: e.target.value })}
                      className="mt-2 w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="e.g., Pro, Elite"
                    />
                  )}
                </div>

                {/* Schedule */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Send Schedule
                  </label>
                  <select
                    value={formData.scheduleType}
                    onChange={(e) => setFormData({ ...formData, scheduleType: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="immediate">Send Immediately</option>
                    <option value="scheduled">Schedule for Later</option>
                  </select>
                  {formData.scheduleType === 'scheduled' && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={formData.scheduledDate || ''}
                        onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                        className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <input
                        type="time"
                        value={formData.scheduledTime || ''}
                        onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                        className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  )}
                </div>

                {/* Questions */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Questions
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={generateQuestionsWithAI}
                        disabled={isGeneratingQuestions}
                        className="px-3 py-1 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
                        title="Generate questions based on user app usage patterns"
                      >
                        {isGeneratingQuestions ? (
                          <>
                            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                            Generating...
                          </>
                        ) : (
                          <>
                            ✨ Generate with AI
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => addQuestion('open-ended')}
                        className="px-3 py-1 text-sm rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                      >
                        + Open-Ended
                      </button>
                      <button
                        onClick={() => addQuestion('multiple-choice')}
                        className="px-3 py-1 text-sm rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                      >
                        + Multiple Choice
                      </button>
                    </div>
                  </div>

                  {/* Generated Questions Panel */}
                  {showGeneratedQuestions && generatedQuestions.length > 0 && (
                    <div className="mb-6 p-4 rounded-lg border-2 border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/20">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                            AI-Generated Questions ({generatedQuestions.length})
                          </h4>
                          {usageStats && (
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              Based on {usageStats.totalUsers} users • Most used: {usageStats.mostUsedFeatures?.map((f: any) => f.feature).join(', ') || 'N/A'} • 
                              Least used: {usageStats.leastUsedFeatures?.map((f: any) => f.feature).join(', ') || 'N/A'}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={addAllGeneratedQuestions}
                            className="px-3 py-1 text-xs rounded-md bg-primary-600 text-white hover:bg-primary-700"
                          >
                            Add All
                          </button>
                          <button
                            onClick={() => {
                              setShowGeneratedQuestions(false);
                              setGeneratedQuestions([]);
                            }}
                            className="px-3 py-1 text-xs rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {generatedQuestions.map((q) => (
                          <div
                            key={q.id}
                            className="p-3 rounded-lg border border-primary-200 dark:border-primary-800 bg-white dark:bg-gray-800"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-medium text-primary-700 dark:text-primary-300">
                                    {q.type === 'open-ended' ? 'Open-Ended' : 'Multiple Choice'}
                                  </span>
                                  {q.reasoning && (
                                    <span className="text-xs text-gray-500 dark:text-gray-400" title={q.reasoning}>
                                      💡
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                                  {q.text}
                                </p>
                                {q.reasoning && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 italic">
                                    {q.reasoning}
                                  </p>
                                )}
                                {q.options && q.options.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {q.options.map((opt, idx) => (
                                      <div key={idx} className="text-xs text-gray-600 dark:text-gray-400 pl-4">
                                        • {opt}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => addGeneratedQuestion(q)}
                                className="ml-3 px-2 py-1 text-xs rounded-md bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    {formData.questions.map((q, idx) => (
                      <div key={q.id} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                        <div className="flex items-start justify-between mb-3">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Question {idx + 1} ({q.type === 'open-ended' ? 'Open-Ended' : 'Multiple Choice'})
                          </span>
                          <button
                            onClick={() => removeQuestion(q.id)}
                            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                          >
                            Remove
                          </button>
                        </div>

                        <input
                          type="text"
                          value={q.text}
                          onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                          className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-3"
                          placeholder="Enter question text"
                        />

                        {q.type === 'multiple-choice' && (
                          <div className="space-y-2 mb-3">
                            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Options:</div>
                            {q.options?.map((opt, optIdx) => (
                              <div key={optIdx} className="flex gap-2">
                                <input
                                  type="text"
                                  value={opt}
                                  onChange={(e) => updateOption(q.id, optIdx, e.target.value)}
                                  className="flex-1 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                  placeholder={`Option ${optIdx + 1}`}
                                />
                                {q.options && q.options.length > 2 && (
                                  <button
                                    onClick={() => removeOption(q.id, optIdx)}
                                    className="px-2 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                            <button
                              onClick={() => addOption(q.id)}
                              className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                            >
                              + Add Option
                            </button>
                          </div>
                        )}

                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={q.required}
                            onChange={(e) => updateQuestion(q.id, { required: e.target.checked })}
                            className="rounded border-gray-300 dark:border-gray-600"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Required</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={saveForm}
                    disabled={isLoading}
                    className="flex-1 px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {isLoading ? 'Saving...' : editingForm ? 'Update Form' : 'Create Form'}
                  </button>
                  <button
                    onClick={() => {
                      setShowFormBuilder(false);
                      setEditingForm(null);
                    }}
                    className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

