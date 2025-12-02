// components/AdGenerator.tsx
// AI-powered ad generation for text and video ads

import React, { useState } from 'react';
import { generateAd, saveGeneratedContent } from '../src/services/geminiService';
import { useAppContext } from './AppContext';
import { UpgradePrompt } from './UpgradePrompt';
import { SparklesIcon, DownloadIcon, CheckCircleIcon } from './icons/UIIcons';
import { InstagramIcon, TikTokIcon, XIcon, YouTubeIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';

interface AdResult {
  adCopy?: string;
  videoPrompt?: string;
  headline?: string;
  description?: string;
  callToAction?: string;
  hashtags?: string[];
  platformRecommendations?: string[];
  estimatedReach?: string;
  tips?: string[];
  sceneBreakdown?: Array<{ time: string; description: string }>;
}

const platformIcons: Record<string, React.ReactNode> = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  Facebook: <FacebookIcon />,
};

export const AdGenerator: React.FC = () => {
  const { user, setActivePage, showToast } = useAppContext();
  
  const [adType, setAdType] = useState<"text" | "video">("text");
  const [product, setProduct] = useState("");
  const [service, setService] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [goal, setGoal] = useState("");
  const [platform, setPlatform] = useState("");
  const [tone, setTone] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [budget, setBudget] = useState("");
  const [duration, setDuration] = useState(15);
  const [additionalContext, setAdditionalContext] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AdResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if user has access to ad generation (premium feature)
  const allowedPlans = ["Pro", "Elite", "Growth", "Starter", "Agency"];
  const isFeatureUnlocked = user?.role === "Admin" || (user?.plan && allowedPlans.includes(user.plan));

  // Get usage limits
  const planLimits: Record<string, { text: number; video: number }> = {
    Pro: { text: 50, video: 10 },
    Elite: { text: 200, video: 50 },
    Growth: { text: 100, video: 25 },
    Starter: { text: 30, video: 5 },
    Agency: { text: 500, video: 100 },
  };

  const limits = user?.plan ? planLimits[user.plan] || { text: 0, video: 0 } : { text: 0, video: 0 };
  const currentTextUsage = user?.monthlyAdGenerationsUsed || 0;
  const currentVideoUsage = user?.monthlyVideoAdGenerationsUsed || 0;
  const usageLeft = adType === "text" 
    ? limits.text - currentTextUsage 
    : limits.video - currentVideoUsage;

  const handleGenerate = async () => {
    if (!product && !service) {
      showToast("Please enter a product or service", "error");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await generateAd({
        adType,
        product: product || undefined,
        service: service || undefined,
        targetAudience: targetAudience || undefined,
        goal: goal || undefined,
        platform: platform || undefined,
        tone: tone || undefined,
        callToAction: callToAction || undefined,
        budget: budget || undefined,
        duration: adType === "video" ? duration : undefined,
        additionalContext: additionalContext || undefined,
      });

      if (response.error) {
        if (response.error.includes("premium") || response.error.includes("limit")) {
          setError(response.error);
          if (response.upgradeUrl) {
            setTimeout(() => setActivePage("pricing"), 2000);
          }
        } else {
          setError(response.error);
        }
        return;
      }

      // Handle response structure
      if (response.result) {
        setResult(response.result);
        showToast(`${adType === "text" ? "Text" : "Video"} ad generated successfully!`, "success");
      } else if (response.adCopy || response.videoPrompt) {
        // Fallback: if result is at top level
        setResult(response as AdResult);
        showToast(`${adType === "text" ? "Text" : "Video"} ad generated successfully!`, "success");
      } else {
        setError("Unexpected response format");
      }
    } catch (err: any) {
      console.error("Ad generation error:", err);
      setError(err.message || "Failed to generate ad. Please try again.");
      showToast("Failed to generate ad", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast("Copied to clipboard!", "success");
  };

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Downloaded!", "success");
  };

  const handleSaveAd = async () => {
    if (!result || !user) return;
    try {
      await saveGeneratedContent('ad', {
        adType,
        adCopy: result.adCopy,
        videoPrompt: result.videoPrompt,
        headline: result.headline,
        description: result.description,
        callToAction: result.callToAction,
        hashtags: result.hashtags,
        platformRecommendations: result.platformRecommendations,
        sceneBreakdown: result.sceneBreakdown,
        product: product || undefined,
        service: service || undefined,
        targetAudience: targetAudience || undefined,
        goal: goal || undefined,
        platform: platform || undefined,
        tone: tone || undefined,
      });
      showToast("Ad saved to profile!", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to save ad", "error");
    }
  };

  if (!isFeatureUnlocked) {
    return (
      <UpgradePrompt
        featureName="AI Ad Generation"
        onUpgradeClick={() => setActivePage("pricing")}
        userType={user?.userType === "Business" ? "Business" : "Creator"}
      />
    );
  }

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <SparklesIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            AI Ad Generator
          </h1>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Generate compelling text ads or video ad prompts for your campaigns
          </p>
          {usageLeft > 0 && (
            <div className="mt-3 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg inline-block">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {usageLeft} {adType === "text" ? "text" : "video"} ad{usageLeft !== 1 ? "s" : ""} remaining this month
              </p>
            </div>
          )}
          {usageLeft <= 0 && (
            <div className="mt-3 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg inline-block">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Monthly limit reached. Upgrade for more ad generations.
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Form */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Ad Details
            </h2>

            {/* Ad Type Toggle */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Ad Type
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setAdType("text")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                    adType === "text"
                      ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300"
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400"
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Text Ad
                </button>
                <button
                  onClick={() => setAdType("video")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                    adType === "video"
                      ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300"
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400"
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Video Ad
                </button>
              </div>
            </div>

            {/* Product/Service */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Product or Service *
              </label>
              <input
                type="text"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="e.g., Fitness App, Consulting Services"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* Target Audience */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Target Audience
              </label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g., Fitness enthusiasts aged 25-40"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* Goal */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Campaign Goal
              </label>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Select goal...</option>
                <option value="awareness">Brand Awareness</option>
                <option value="engagement">Engagement</option>
                <option value="conversion">Conversion</option>
                <option value="sales">Sales</option>
                {(user?.userType === 'Creator' || user?.plan === 'Agency') && (
                  <option value="followers">Increase Followers/Fans</option>
                )}
              </select>
            </div>

            {/* Platform */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Any Platform</option>
                <option value="Instagram">Instagram</option>
                <option value="TikTok">TikTok</option>
                <option value="X">X (Twitter)</option>
                <option value="YouTube">YouTube</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="Facebook">Facebook</option>
              </select>
            </div>

            {/* Tone */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tone
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Select tone...</option>
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="funny">Funny</option>
                <option value="inspiring">Inspiring</option>
                <option value="urgent">Urgent</option>
                {/* Show sexy/bold and sexy/explicit only for Creators and Agency */}
                {(user?.userType === 'Creator' || user?.plan === 'Agency') && (
                  <>
                    <option value="sexy-bold">Sexy / Bold</option>
                    <option value="sexy-explicit">Sexy / Explicit</option>
                  </>
                )}
              </select>
            </div>

            {/* Call to Action */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Call to Action
              </label>
              <input
                type="text"
                value={callToAction}
                onChange={(e) => setCallToAction(e.target.value)}
                placeholder="e.g., Sign Up Now, Learn More"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* Duration (for video ads) */}
            {adType === "video" && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Video Duration (seconds)
                </label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value) || 15)}
                  min={5}
                  max={60}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            )}

            {/* Additional Context */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Additional Context (Optional)
              </label>
              <textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder="Any additional details, key points, or requirements..."
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={isLoading || (!product && !service) || usageLeft <= 0}
              className="w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors"
            >
              {isLoading ? "Generating..." : `Generate ${adType === "text" ? "Text" : "Video"} Ad`}
            </button>
          </div>

          {/* Results */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Generated Ad
            </h2>

            {error && (
              <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                {/* Action buttons */}
                <div className="flex gap-2 justify-end pb-2 border-b border-gray-200 dark:border-gray-700">
                  <button
                    onClick={handleSaveAd}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                    Save to Profile
                  </button>
                  <button
                    onClick={() => {
                      const content = [
                        result.headline,
                        adType === 'text' ? result.adCopy : result.videoPrompt,
                        result.description,
                        result.callToAction,
                        result.hashtags?.join(' '),
                      ].filter(Boolean).join('\n\n');
                      handleDownload(content, `ad-${adType}-${Date.now()}.txt`);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <DownloadIcon className="w-4 h-4" />
                    Download
                  </button>
                </div>

                {/* Headline */}
                {result.headline && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Headline
                      </label>
                      <button
                        onClick={() => handleCopy(result.headline!)}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {result.headline}
                    </p>
                  </div>
                )}

                {/* Ad Copy or Video Prompt */}
                {adType === "text" && result.adCopy && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Ad Copy
                      </label>
                      <button
                        onClick={() => handleCopy(result.adCopy!)}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {result.adCopy}
                    </p>
                  </div>
                )}

                {adType === "video" && result.videoPrompt && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Video Generation Prompt
                      </label>
                      <button
                        onClick={() => handleCopy(result.videoPrompt!)}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {result.videoPrompt}
                    </p>
                  </div>
                )}

                {/* Description */}
                {result.description && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Description
                      </label>
                      <button
                        onClick={() => handleCopy(result.description!)}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-gray-700 dark:text-gray-300">
                      {result.description}
                    </p>
                  </div>
                )}

                {/* Call to Action */}
                {result.callToAction && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Call to Action
                    </label>
                    <p className="text-primary-600 dark:text-primary-400 font-semibold">
                      {result.callToAction}
                    </p>
                  </div>
                )}

                {/* Hashtags */}
                {result.hashtags && result.hashtags.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Hashtags
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {result.hashtags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Scene Breakdown (for video ads) */}
                {adType === "video" && result.sceneBreakdown && result.sceneBreakdown.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Scene Breakdown
                    </label>
                    <div className="space-y-2">
                      {result.sceneBreakdown.map((scene, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                        >
                          <span className="font-semibold text-primary-600 dark:text-primary-400">
                            {scene.time}:
                          </span>{" "}
                          {scene.description}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Platform Recommendations */}
                {result.platformRecommendations && result.platformRecommendations.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Recommended Platforms
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {result.platformRecommendations.map((plat, idx) => (
                        <span
                          key={idx}
                          className="flex items-center gap-1 px-3 py-1 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 rounded-full text-sm"
                        >
                          {platformIcons[plat] || null}
                          {plat}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tips */}
                {result.tips && result.tips.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Tips
                    </label>
                    <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
                      {result.tips.map((tip, idx) => (
                        <li key={idx}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {!result && !error && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <SparklesIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Fill in the form and click "Generate Ad" to create your ad</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

