import React, { useState, useEffect, useMemo } from 'react';
import { auth } from '../firebaseConfig';
import { useAppContext } from './AppContext';

interface FeedbackSubmission {
  id: string;
  uid: string;
  milestone: 'day7' | 'day14' | string;
  createdAt: string;
  email: string;
  name: string | null;
  plan: string | null;
  category?: string;
  answers: Record<string, string>;
  openEnded: Record<string, string>;
  sentimentScore?: number;
  sentimentLabel?: 'positive' | 'neutral' | 'negative';
}

interface FeedbackStats {
  total: number;
  day7: number;
  day14: number;
  averageSentiment: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
}

export const AdminFeedbackPanel: React.FC = () => {
  const { showToast } = useAppContext();
  const [feedback, setFeedback] = useState<FeedbackSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMilestone, setSelectedMilestone] = useState<'all' | 'day7' | 'day14' | 'custom' | 'user_feedback'>('all');
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackSubmission | null>(null);
  const [analyzingSentiment, setAnalyzingSentiment] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyView, setHistoryView] = useState<'all' | 'day7' | 'day14' | 'custom'>('all');
  
  // Response generation state
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [generatedResponse, setGeneratedResponse] = useState<{ subject: string; body: string } | null>(null);
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);
  const [isSendingResponse, setIsSendingResponse] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchFeedback();
  }, []);

  const fetchFeedback = async () => {
    setIsLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch('/api/adminGetFeedback', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch feedback');
      }

      setFeedback(data.feedback || []);
      setStats(data.stats || null);
    } catch (err: any) {
      console.error('Failed to fetch feedback:', err);
      showToast(err?.message || 'Failed to fetch feedback', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeSentiment = async (feedbackId: string, text: string) => {
    if (analyzingSentiment === feedbackId) return;
    
    setAnalyzingSentiment(feedbackId);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch('/api/analyzeSentiment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to analyze sentiment');
      }

      // Update local feedback with sentiment
      setFeedback(prev => prev.map(f => 
        f.id === feedbackId 
          ? { ...f, sentimentScore: data.sentimentScore, sentimentLabel: data.sentimentLabel }
          : f
      ));

      showToast('Sentiment analyzed successfully', 'success');
    } catch (err: any) {
      console.error('Failed to analyze sentiment:', err);
      showToast(err?.message || 'Failed to analyze sentiment', 'error');
    } finally {
      setAnalyzingSentiment(null);
    }
  };

  const filteredFeedback = useMemo(() => {
    if (selectedMilestone === 'all') {
      return feedback;
    }
    if (selectedMilestone === 'custom') {
      return feedback.filter(f => f.milestone === 'custom');
    }
    return feedback.filter(f => f.milestone === selectedMilestone);
  }, [feedback, selectedMilestone]);

  const getSentimentColor = (label?: string) => {
    if (!label) return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    if (label === 'positive') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    if (label === 'negative') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
  };

  const getSentimentIcon = (label?: string) => {
    if (!label) return '😐';
    if (label === 'positive') return '😊';
    if (label === 'negative') return '😞';
    return '😐';
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredFeedback.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredFeedback.map(f => f.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) {
      showToast('Please select at least one feedback to delete', 'error');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} feedback submission(s)? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/deleteFeedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete feedback');
      }

      // Remove deleted feedback from local state
      setFeedback(prev => prev.filter(f => !selectedIds.has(f.id)));
      setSelectedIds(new Set());
      showToast(`Successfully deleted ${selectedIds.size} feedback submission(s)`, 'success');
    } catch (err: any) {
      console.error('Failed to delete feedback:', err);
      showToast(err?.message || 'Failed to delete feedback', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Feedback</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              View and analyze all user feedback submissions, including custom forms and surveys
            </p>
          </div>
          <button
            onClick={fetchFeedback}
            disabled={isLoading}
            className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <div className="text-sm text-blue-700 dark:text-blue-300 mb-1">Total Feedback</div>
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{stats.total}</div>
            </div>
            <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
              <div className="text-sm text-purple-700 dark:text-purple-300 mb-1">User Feedback</div>
              <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                {feedback.filter(f => f.milestone === 'user_feedback').length}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
              <div className="text-sm text-indigo-700 dark:text-indigo-300 mb-1">Custom Forms</div>
              <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">
                {feedback.filter(f => f.milestone === 'custom').length}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="text-sm text-green-700 dark:text-green-300 mb-1">Positive</div>
              <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                {stats.positiveCount || 0}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
              <div className="text-sm text-orange-700 dark:text-orange-300 mb-1">Avg Sentiment</div>
              <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                {stats.averageSentiment.toFixed(1)}
              </div>
            </div>
          </div>
        )}

        {/* Filters and History Toggle */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedMilestone('all')}
              className={`px-4 py-2 rounded-md transition-colors ${
                selectedMilestone === 'all'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSelectedMilestone('user_feedback' as any)}
              className={`px-4 py-2 rounded-md transition-colors ${
                selectedMilestone === 'user_feedback'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              User Feedback
            </button>
            <button
              onClick={() => setSelectedMilestone('custom' as any)}
              className={`px-4 py-2 rounded-md transition-colors ${
                selectedMilestone === 'custom'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Custom Forms
            </button>
            <button
              onClick={() => setSelectedMilestone('day7')}
              className={`px-3 py-2 rounded-md transition-colors text-sm ${
                selectedMilestone === 'day7'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Day 7
            </button>
            <button
              onClick={() => setSelectedMilestone('day14')}
              className={`px-3 py-2 rounded-md transition-colors text-sm ${
                selectedMilestone === 'day14'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Day 14
            </button>
          </div>
          <div className="flex gap-2 items-center">
            {selectedIds.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isDeleting ? 'Deleting...' : `Delete ${selectedIds.size} Selected`}
              </button>
            )}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              {showHistory ? 'Hide Stats' : 'View Stats'}
            </button>
          </div>
        </div>

        {/* Stats View Toggle */}
        {showHistory && (
          <div className="mb-6 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Feedback Statistics</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-600 dark:text-gray-400 mb-1">Total Submissions</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.total || 0}</div>
              </div>
              <div>
                <div className="text-gray-600 dark:text-gray-400 mb-1">User Feedback</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {feedback.filter(f => f.milestone === 'user_feedback').length}
                </div>
              </div>
              <div>
                <div className="text-gray-600 dark:text-gray-400 mb-1">Custom Form Responses</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {feedback.filter(f => f.milestone === 'custom').length}
                </div>
              </div>
              <div>
                <div className="text-gray-600 dark:text-gray-400 mb-1">Legacy Surveys (Day 7/14)</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {(stats?.day7 || 0) + (stats?.day14 || 0)}
                </div>
              </div>
              <div>
                <div className="text-gray-600 dark:text-gray-400 mb-1">Positive Sentiment</div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats?.positiveCount || 0}</div>
              </div>
              <div>
                <div className="text-gray-600 dark:text-gray-400 mb-1">Neutral Sentiment</div>
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats?.neutralCount || 0}</div>
              </div>
              <div>
                <div className="text-gray-600 dark:text-gray-400 mb-1">Negative Sentiment</div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats?.negativeCount || 0}</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                <p className="mb-2">📊 <strong>Sentiment Distribution:</strong></p>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-green-500 h-2 rounded-full" 
                      style={{ width: `${stats && stats.total > 0 ? (stats.positiveCount / stats.total * 100) : 0}%` }}
                    ></div>
                  </div>
                  <span className="text-xs">Positive: {stats?.positiveCount || 0}</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-yellow-500 h-2 rounded-full" 
                      style={{ width: `${stats && stats.total > 0 ? (stats.neutralCount / stats.total * 100) : 0}%` }}
                    ></div>
                  </div>
                  <span className="text-xs">Neutral: {stats?.neutralCount || 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-red-500 h-2 rounded-full" 
                      style={{ width: `${stats && stats.total > 0 ? (stats.negativeCount / stats.total * 100) : 0}%` }}
                    ></div>
                  </div>
                  <span className="text-xs">Negative: {stats?.negativeCount || 0}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Feedback List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading feedback...</p>
          </div>
        ) : filteredFeedback.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>No feedback submissions found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredFeedback.length > 0 && (
              <div className="flex items-center gap-2 mb-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <input
                  type="checkbox"
                  checked={filteredFeedback.length > 0 && selectedIds.size === filteredFeedback.length}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Select All ({filteredFeedback.length})
                </label>
              </div>
            )}
            {filteredFeedback.map((item) => {
              const allText = [
                ...Object.values(item.openEnded || {}),
                ...Object.values(item.answers || {})
              ].join(' ');

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => handleToggleSelect(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => setSelectedFeedback(item)}
                      >
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {item.name || item.email}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSentimentColor(item.sentimentLabel)}`}>
                            {getSentimentIcon(item.sentimentLabel)} {item.sentimentLabel || 'Not analyzed'}
                          </span>
                          <span className="px-2 py-1 rounded-full text-xs bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                            {item.milestone === 'user_feedback' ? (item.category || 'User Feedback') : item.milestone}
                          </span>
                          {item.plan && (
                            <span className="px-2 py-1 rounded-full text-xs bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                              {item.plan}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          {new Date(item.createdAt).toLocaleString()}
                        </p>
                        {allText && (
                          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                            {allText.substring(0, 150)}...
                          </p>
                        )}
                      </div>
                    </div>
                    {!item.sentimentScore && allText.trim() && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          analyzeSentiment(item.id, allText);
                        }}
                        disabled={analyzingSentiment === item.id}
                        className="ml-4 px-3 py-1 text-xs rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-50 flex-shrink-0"
                      >
                        {analyzingSentiment === item.id ? 'Analyzing...' : 'Analyze Sentiment'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Feedback Detail Modal */}
      {selectedFeedback && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Feedback Details</h3>
                <button
                  onClick={() => setSelectedFeedback(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">User</div>
                  <div className="font-semibold text-gray-900 dark:text-white">
                    {selectedFeedback.name || selectedFeedback.email}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Email</div>
                  <div className="text-gray-900 dark:text-white">{selectedFeedback.email}</div>
                </div>

                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Type</div>
                  <div className="text-gray-900 dark:text-white">
                    {selectedFeedback.milestone === 'user_feedback' 
                      ? `User Feedback${(selectedFeedback as any).category ? ` - ${(selectedFeedback as any).category}` : ''}`
                      : selectedFeedback.milestone}
                  </div>
                </div>

                {selectedFeedback.sentimentScore !== undefined && (
                  <div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Sentiment</div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getSentimentColor(selectedFeedback.sentimentLabel)}`}>
                        {getSentimentIcon(selectedFeedback.sentimentLabel)} {selectedFeedback.sentimentLabel}
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Score: {selectedFeedback.sentimentScore.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                {Object.keys(selectedFeedback.answers || {}).length > 0 && (
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Multiple Choice Answers</div>
                    <div className="space-y-2">
                      {Object.entries(selectedFeedback.answers || {}).map(([key, value]) => (
                        <div key={key} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">{key}</div>
                          <div className="text-gray-900 dark:text-white">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Object.keys(selectedFeedback.openEnded || {}).length > 0 && (
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Open-Ended Responses</div>
                    <div className="space-y-2">
                      {Object.entries(selectedFeedback.openEnded || {}).map(([key, value]) => (
                        <div key={key} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">{key}</div>
                          <div className="text-gray-900 dark:text-white whitespace-pre-wrap">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Submitted: {new Date(selectedFeedback.createdAt).toLocaleString()}
                  </div>
                  {(selectedFeedback as any).respondedAt && (
                    <div className="mb-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                      <div className="text-xs text-green-700 dark:text-green-300 font-medium mb-1">
                        ✓ Response sent on {new Date((selectedFeedback as any).respondedAt).toLocaleString()}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => setShowResponseModal(true)}
                    className="w-full px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 font-medium"
                  >
                    {(selectedFeedback as any).respondedAt ? 'Send Another Response' : '✨ Generate & Send Response'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Response Generation Modal */}
      {showResponseModal && selectedFeedback && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Generate Response</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    AI will generate a personalized response to {selectedFeedback.name || selectedFeedback.email}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowResponseModal(false);
                    setGeneratedResponse(null);
                    setAdminNotes('');
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 mt-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Admin Notes (optional)
                  </label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={3}
                    placeholder="Add any specific instructions or context for the AI response..."
                    className="w-full px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    These notes will guide the AI in crafting the response (e.g., "Mention we're working on this feature" or "Apologize for the bug")
                  </p>
                </div>

                {!generatedResponse && (
                  <button
                    onClick={async () => {
                      setIsGeneratingResponse(true);
                      try {
                        const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
                        if (!token) throw new Error('Not authenticated');

                        const res = await fetch('/api/generateFeedbackResponse', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({
                            feedbackId: selectedFeedback.id,
                            adminNotes: adminNotes.trim() || undefined,
                          }),
                        });

                        const data = await res.json();
                        if (!res.ok || !data.success) {
                          throw new Error(data.error || data.note || 'Failed to generate response');
                        }

                        setGeneratedResponse({
                          subject: data.subject,
                          body: data.body,
                        });
                        showToast('Response generated! Review and edit if needed.', 'success');
                      } catch (e: any) {
                        console.error('Failed to generate response:', e);
                        showToast(e?.message || 'Failed to generate response', 'error');
                      } finally {
                        setIsGeneratingResponse(false);
                      }
                    }}
                    disabled={isGeneratingResponse}
                    className="w-full px-4 py-3 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {isGeneratingResponse ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                        Generating response...
                      </span>
                    ) : (
                      '✨ Generate AI Response'
                    )}
                  </button>
                )}

                {generatedResponse && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                        Subject
                      </label>
                      <input
                        type="text"
                        value={generatedResponse.subject}
                        onChange={(e) => setGeneratedResponse({ ...generatedResponse, subject: e.target.value })}
                        className="w-full px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                        Message
                      </label>
                      <textarea
                        value={generatedResponse.body}
                        onChange={(e) => setGeneratedResponse({ ...generatedResponse, body: e.target.value })}
                        rows={12}
                        className="w-full px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => {
                          setGeneratedResponse(null);
                          setAdminNotes('');
                        }}
                        className="px-4 py-2 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                        disabled={isSendingResponse}
                      >
                        Regenerate
                      </button>
                      <button
                        onClick={async () => {
                          setIsSendingResponse(true);
                          try {
                            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
                            if (!token) throw new Error('Not authenticated');

                            const res = await fetch('/api/sendFeedbackResponse', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${token}`,
                              },
                              body: JSON.stringify({
                                feedbackId: selectedFeedback.id,
                                subject: generatedResponse.subject,
                                body: generatedResponse.body,
                              }),
                            });

                            const data = await res.json();
                            if (!res.ok || !data.success) {
                              throw new Error(data.error || 'Failed to send response');
                            }

                            showToast('Response sent successfully!', 'success');
                            setShowResponseModal(false);
                            setGeneratedResponse(null);
                            setAdminNotes('');
                            setSelectedFeedback(null);
                            // Refresh feedback list
                            fetchFeedback();
                          } catch (e: any) {
                            console.error('Failed to send response:', e);
                            showToast(e?.message || 'Failed to send response', 'error');
                          } finally {
                            setIsSendingResponse(false);
                          }
                        }}
                        disabled={isSendingResponse || !generatedResponse.subject.trim() || !generatedResponse.body.trim()}
                        className="flex-1 px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                      >
                        {isSendingResponse ? 'Sending...' : 'Send Response'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

