import React, { useState, useEffect } from "react";
import { useAppContext } from "./AppContext";
import { AutopilotStatus, Post, Platform, AutopilotCampaign } from "../types";
import { RocketIcon, BriefcaseIcon, RefreshIcon, SparklesIcon } from "./icons/UIIcons";
import { OFFLINE_MODE } from "../constants";
import {
  generateAutopilotSuggestions,
  generateAutopilotPlan,
} from "../src/services/geminiService";
import { executeAutopilotCampaign } from "../src/services/autopilotExecutionService";
import { UpgradePrompt } from "./UpgradePrompt";
import { AutopilotCampaignDetailModal } from "./AutopilotCampaignDetailModal";
import { getTemplatesForUserType, CampaignTemplate } from "../src/services/campaignTemplates";
import { db } from "../firebaseConfig";
import { collection, doc, setDoc } from "firebase/firestore";

// Helper function to calculate total posts from plan
const calculateTotalPostsFromPlan = (plan: any): number => {
  if (!plan) return 0;
  
  // Handle different plan structures
  const planData = plan.plan || plan;
  
  // Check if it's the autopilot plan format (weeks[].days[])
  if (planData.weeks && Array.isArray(planData.weeks)) {
    return planData.weeks.reduce((total: number, week: any) => {
      if (week.days && Array.isArray(week.days)) {
        return total + week.days.length;
      }
      if (week.content && Array.isArray(week.content)) {
        return total + week.content.length;
      }
      return total;
    }, 0);
  }
  
  return 0;
};

// Helper function to validate plan structure
const validatePlanStructure = (plan: any): boolean => {
  if (!plan) return false;
  const planData = plan.plan || plan;
  return planData.weeks && Array.isArray(planData.weeks) && planData.weeks.length > 0;
};

const Autopilot: React.FC = () => {
  const {
    user,
    autopilotCampaigns,
    addAutopilotCampaign,
    updateAutopilotCampaign,
    showToast,
    setActivePage,
    addCalendarEvent,
    setPosts,
    posts,
    settings,
  } = useAppContext();

  const [selectedIdea, setSelectedIdea] = useState("");
  const [customGoal, setCustomGoal] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedIdeas, setSuggestedIdeas] = useState<string[]>([]);
  const [isFetchingIdeas, setIsFetchingIdeas] = useState(true);
  const [generatingCampaignId, setGeneratingCampaignId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [selectedCampaignForDetail, setSelectedCampaignForDetail] = useState<AutopilotCampaign | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  // Check for pending strategy from Strategy page
  useEffect(() => {
    const pendingStrategy = localStorage.getItem('pendingStrategyForAutopilot');
    if (pendingStrategy) {
      try {
        const strategy = JSON.parse(pendingStrategy);
        // Pre-fill form with strategy data
        if (strategy.goal) {
          setCustomGoal(strategy.goal);
        }
        // Show toast notification
        showToast(`Strategy "${strategy.strategyName}" loaded! You can use it to inform your campaign.`, 'success');
        // Clear the pending strategy
        localStorage.removeItem('pendingStrategyForAutopilot');
      } catch (error) {
        console.error('Failed to parse pending strategy:', error);
        localStorage.removeItem('pendingStrategyForAutopilot');
      }
    }
  }, []); // Only run on mount

  if (!user) return null;

  const isBusiness = user.userType === "Business";
  const availableTemplates = getTemplatesForUserType(isBusiness ? 'Business' : 'Creator');
  const nicheOrIndustry = isBusiness ? user.businessType : user.niche;
  const audience = user.audience || "their target audience";

  // Check if user has access to Autopilot/Marketing Manager
  const hasAccess = (() => {
    if (user.role === 'Admin') return true;
    if (isBusiness) {
      // Marketing Manager: All Business plans (Starter, Growth, Agency)
      return ['Starter', 'Growth', 'Agency'].includes(user.plan);
    }
    // AI Autopilot for Creators: Pro, Elite, Agency plans
    return ['Pro', 'Elite', 'Agency'].includes(user.plan);
  })();

  // Show upgrade prompt if user doesn't have access
  if (!hasAccess) {
    return (
      <UpgradePrompt
        featureName={isBusiness ? "AI Marketing Manager" : "AI Autopilot"}
        onUpgradeClick={() => setActivePage('pricing')}
        userType={isBusiness ? 'Business' : 'Creator'}
      />
    );
  }

  // ---------------------------
  // FETCH AI IDEAS
  // ---------------------------
  const fetchSuggestions = async () => {
    setIsFetchingIdeas(true);
    try {
      const { ideas } = await generateAutopilotSuggestions(
        nicheOrIndustry || "general",
        audience,
        user.userType || "Creator"
      );

      if (!Array.isArray(ideas)) {
        throw new Error("Invalid AI response");
      }

      setSuggestedIdeas(ideas);
    } catch (err: any) {
      // Silently handle errors - use fallback suggestions instead
      if (process.env.NODE_ENV === 'development') {
        console.warn("Failed to fetch AI suggestions (using fallback):", err?.message);
      }
      
      // Safe fallback ideas so UI still works
      setSuggestedIdeas(
        isBusiness
          ? ["Promote a Weekly Special", "Highlight a 5-Star Review", "Showcase Customer Success Story", "Announce New Product Launch"]
          : ["Promote a New Video", "Announce a Collaboration", "Share Behind-the-Scenes", "Engage with Trending Topic"]
      );
    } finally {
      setIsFetchingIdeas(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.userType]);

  // ---------------------------
  // CONTENT GENERATION PIPELINE
  // ---------------------------
  const generateContentForCampaign = async (campaignId: string, campaign: any) => {
    if (!user || !campaign.plan) return;
    
    // Prevent duplicate generation
    if (generatingCampaignId === campaignId) {
      console.log('Campaign generation already in progress');
      return;
    }

    setGeneratingCampaignId(campaignId);
    setGenerationProgress({ current: 0, total: campaign.totalPosts || 0 });
    
    try {
      // Update progress callback function
      const updateProgress = async (current: number, total: number) => {
        const progress = total > 0 ? Math.round((current / total) * 100) : 0;
        setGenerationProgress({ current, total });
        await updateAutopilotCampaign(campaignId, {
          progress,
          generatedPosts: current,
        });
      };

      // Try to get analytics data for smart scheduling (optional)
      let analyticsData = null;
      try {
        // Analytics data would ideally come from context or be fetched here
        // For now, we'll pass null and let it use default scheduling
        // TODO: Fetch or pass analytics data from context when available
      } catch (e) {
        console.log('Analytics data not available, using default scheduling');
      }

      // Execute the campaign to generate all posts
      console.log('Executing autopilot campaign:', campaignId);
      const { posts: generatedPosts, approvalItems, calendarEvents } = await executeAutopilotCampaign(
        campaign,
        { ...settings, userType: user.userType },
        updateProgress,
        analyticsData
      );

      console.log('Campaign execution complete:', {
        approvalItems: approvalItems.length,
        calendarEvents: calendarEvents.length,
        generatedPosts: generatedPosts.length
      });

      // Create Post entries for approval queue
      const newPosts: Post[] = [];
      for (const approvalItem of approvalItems) {
        const postId = approvalItem.id;
        const post: Post = {
          id: postId,
          content: approvalItem.content.text || '',
          mediaUrl: approvalItem.content.imageUrl,
          mediaType: approvalItem.type === 'Image' ? 'image' : approvalItem.type === 'Video' ? 'video' : undefined,
          platforms: (approvalItem as any).platforms || ['Instagram'],
          status: 'In Review',
          author: { name: user.name, avatar: user.avatar },
          comments: [],
          scheduledDate: (approvalItem as any).scheduledDate,
          createdAt: new Date().toISOString(), // Add timestamp for sorting
        };
        newPosts.push(post);

        // Save to Firestore
        try {
          const postsCollectionRef = collection(db, 'users', user.id, 'posts');
          const safePost = JSON.parse(JSON.stringify(post));
          await setDoc(doc(postsCollectionRef, post.id), safePost);
          console.log('Saved post to Firestore:', postId);
        } catch (error) {
          console.error('Failed to save post to Firestore:', postId, error);
          showToast(`Failed to save post ${postId}. Please check console.`, 'error');
        }
      }

      // Add to local state
      if (newPosts.length > 0) {
        setPosts(prev => [...prev, ...newPosts]);
        console.log(`Added ${newPosts.length} posts to local state`);
      } else {
        console.warn('No posts were created from approval items');
      }

      // Add calendar events
      for (const event of calendarEvents) {
        await addCalendarEvent(event);
      }

      // Update campaign status - use approvalItems count (one per platform)
      const totalGenerated = approvalItems.length;
      
      // Only mark as Complete if we actually generated content
      if (totalGenerated > 0) {
        await updateAutopilotCampaign(campaignId, {
          status: 'Complete' as AutopilotStatus,
          generatedPosts: totalGenerated,
          progress: 100,
        });

        showToast(`Campaign complete! ${totalGenerated} posts generated and added to approval queue.`, "success");
      } else {
        // If no content was generated, mark as failed
        await updateAutopilotCampaign(campaignId, {
          status: 'Failed' as AutopilotStatus,
        });
        showToast("Campaign completed but no posts were generated. Please check your campaign plan.", "error");
      }
      
    } catch (error) {
      console.error("Content generation failed:", error);
      await updateAutopilotCampaign(campaignId, {
        status: 'Failed' as AutopilotStatus,
      });
      showToast("Failed to generate content. Please try again.", "error");
    } finally {
      setGeneratingCampaignId(null);
      setGenerationProgress({ current: 0, total: 0 });
    }
  };

  // Auto-start content generation when campaign status changes to "Generating Content"
  useEffect(() => {
    // Find campaigns that need content generation
    const campaignsToGenerate = autopilotCampaigns.filter(c => 
      c.status === 'Generating Content' && 
      c.plan &&
      c.id !== generatingCampaignId
    );
    
    // Only process one campaign at a time
    if (campaignsToGenerate.length > 0 && !generatingCampaignId) {
      const campaign = campaignsToGenerate[0];
      console.log('Starting content generation for campaign:', campaign.id, campaign.goal);
      generateContentForCampaign(campaign.id, campaign).catch(error => {
        console.error('Error in generateContentForCampaign:', error);
        showToast('Failed to generate content. Please try again.', 'error');
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopilotCampaigns, generatingCampaignId]);

  // ---------------------------
  // LAUNCH CAMPAIGN
  // ---------------------------
  const handleLaunch = async () => {
    const goal = customGoal.trim() || selectedIdea;

    if (!goal) {
      showToast("Please select an idea or write a custom goal.", "error");
      return;
    }

    setIsLoading(true);
    let campaignId: string | null = null;
    
    try {
      // 1) Create campaign record and get its ID
      const createdCampaignId = await addAutopilotCampaign({
        goal,
        niche: nicheOrIndustry || "General",
        audience,
        status: "Strategizing",
      });
      campaignId = createdCampaignId;

      // 2) Generate and save the campaign plan
      try {
        const connected = (user.settings as any)?.connectedAccounts || {};
        const channels = Object.entries(connected)
          .filter(([, isOn]) => !!isOn)
          .map(([platformKey]) => platformKey);

        // Generate the plan
        const planResponse = await generateAutopilotPlan({
          goal,
          niche: nicheOrIndustry || "General",
          audience,
          channels,
          durationWeeks: 4,
        });

        // Extract plan (handle both direct plan or wrapped response)
        const plan = planResponse.plan || planResponse;
        
        // Validate plan structure
        if (!validatePlanStructure(plan)) {
          throw new Error("Invalid plan structure received from API. Please try again.");
        }
        
        // Calculate total posts from plan
        const totalPosts = calculateTotalPostsFromPlan(plan);

        // Save plan to campaign
        if (!campaignId) {
          throw new Error("Campaign ID is missing");
        }
        
        await updateAutopilotCampaign(campaignId, {
          plan: plan,
          status: "Generating Content",
          totalPosts: totalPosts,
          progress: 0,
        });

        showToast(`Campaign plan generated! ${totalPosts} posts will be created.`, "success");
        
        // Content generation will be triggered automatically by the useEffect above

      } catch (planErr) {
        console.error("Failed to generate plan:", planErr);
        if (campaignId) {
          await updateAutopilotCampaign(campaignId, {
            status: "Failed",
          });
        }
        showToast("Failed to generate campaign plan. Please try again.", "error");
      }

      setSelectedIdea("");
      setCustomGoal("");
    } catch (e) {
      console.error("Launch failed:", e);
      showToast("There was an error launching your campaign.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------
  // STATUS DISPLAY
  // ---------------------------
  const getStatusInfo = (
    status: AutopilotStatus,
    campaign: any
  ): { color: string; text: string; icon: React.ReactNode } => {
    switch (status) {
      case "Strategizing":
        return {
          color: "bg-gradient-to-r from-blue-500 to-blue-600",
          text: "AI is building your campaign content plan...",
          icon: <SparklesIcon className="w-4 h-4" />,
        };
      case "Generating Content":
        const progressText = campaign.totalPosts > 0
          ? `Generating your content pack... ${campaign.generatedPosts || 0} / ${campaign.totalPosts} posts`
          : "AI is creating posts for your campaign...";
        return {
          color: "bg-gradient-to-r from-purple-500 to-pink-600",
          text: progressText,
          icon: <RocketIcon />,
        };
      case "Complete":
        return {
          color: "bg-gradient-to-r from-green-500 to-emerald-600",
          text: `Content pack ready! ${campaign.generatedPosts || 0} posts ready to review, edit, and copy.`,
          icon: <SparklesIcon className="w-4 h-4" />,
        };
      case "Failed":
        return {
          color: "bg-gradient-to-r from-red-500 to-red-600",
          text: "Campaign failed. Please try again.",
          icon: null,
        };
      default:
        return { color: "bg-gray-400", text: "Idle", icon: null };
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 px-4 py-8">
      {/* ENHANCED HEADER WITH GRADIENT */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-primary-500 to-purple-600 shadow-2xl max-w-2xl mx-auto">
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative px-6 py-8 text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-xl bg-white/20 backdrop-blur-sm text-white mb-4 shadow-lg">
            {isBusiness ? <BriefcaseIcon className="w-8 h-8 text-white" /> : <RocketIcon />}
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-2">
            {isBusiness ? "AI Campaign Studio" : "AI Content Autopilot"}
          </h1>
          <p className="mt-1 text-base text-white/90 max-w-lg mx-auto">
            {isBusiness
              ? "Launch intelligent marketing campaigns. Our AI handles the strategy and content pack so your team can post where it matters."
              : "Set your content goals and let AI generate a complete campaign plan and content pack you can post anywhere."}
          </p>
        </div>
      </div>

      {/* ENHANCED LAUNCH CAMPAIGN BOX */}
      <div className="bg-white dark:bg-gray-800 p-8 md:p-10 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary-500 to-purple-500 flex items-center justify-center">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
          Launch a New Campaign
        </h3>
        </div>

        {/* Custom Goal */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Define Your Own Goal
          </label>
          <textarea
            value={customGoal}
            onChange={(e) => {
              setCustomGoal(e.target.value);
              setSelectedIdea("");
            }}
            placeholder={isBusiness 
              ? "e.g., Launch a 4-week campaign to promote our new product line with engaging visuals and customer testimonials"
              : "e.g., Run a 2-week hype campaign for my new video release with behind-the-scenes content"
            }
            rows={3}
            className="w-full p-4 border-2 rounded-xl bg-gray-50 dark:bg-gray-700/50 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:text-white dark:placeholder-gray-400 transition-all"
          />
        </div>

        {/* OR Divider */}
        <div className="flex items-center gap-4 my-8">
          <div className="flex-grow h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
          <span className="text-sm font-bold text-gray-500 dark:text-gray-400 px-4 py-1 bg-gray-100 dark:bg-gray-700 rounded-full">
            OR
          </span>
          <div className="flex-grow h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
        </div>

        {/* AI Suggestions */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Select an AI-Generated Idea
            </label>

            <button
              onClick={fetchSuggestions}
              disabled={isFetchingIdeas}
              className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              <RefreshIcon
                className={`w-4 h-4 ${
                  isFetchingIdeas ? "animate-spin" : ""
                }`}
              />
              Refresh Ideas
            </button>
          </div>

          {isFetchingIdeas ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <div className="inline-flex items-center gap-2">
                <SparklesIcon className="w-5 h-5 animate-pulse" />
                <span>Generating fresh ideas...</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {suggestedIdeas.map((idea) => (
                <button
                  key={idea}
                  onClick={() => {
                    setSelectedIdea(idea);
                    setCustomGoal("");
                  }}
                  className={`p-5 border-2 rounded-xl text-left font-semibold transition-all transform ${
                    selectedIdea === idea
                      ? "border-primary-500 bg-gradient-to-br from-primary-50 to-purple-50 dark:from-primary-900/30 dark:to-purple-900/30 scale-105 shadow-lg"
                      : "border-gray-300 dark:border-gray-600 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:scale-102"
                  }`}
                >
                  {idea}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Launch Button */}
        <div className="mt-10 flex justify-center">
          <button
            onClick={handleLaunch}
            disabled={isLoading || (!selectedIdea && !customGoal.trim())}
            className="group px-10 py-4 bg-gradient-to-r from-primary-600 via-primary-500 to-purple-600 text-white font-bold rounded-full shadow-xl hover:shadow-2xl transform transition-all hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center gap-3 text-lg"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Launching Campaign...
              </>
            ) : (
              <>
                <div className="group-hover:translate-x-1 transition-transform">
                  <RocketIcon />
                </div>
                Launch Campaign
              </>
            )}
          </button>
        </div>
      </div>

      {/* ENHANCED ACTIVE CAMPAIGNS */}
      <div className="space-y-6">
        <h3 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <div className="h-1 w-12 bg-gradient-to-r from-primary-500 to-purple-500 rounded-full" />
          Active Campaigns
        </h3>

        {autopilotCampaigns.length > 0 ? (
          autopilotCampaigns.map((campaign) => {
            const statusInfo = getStatusInfo(campaign.status, campaign);
            const isGenerating = generatingCampaignId === campaign.id;

            return (
              <div
                key={campaign.id}
                className="relative overflow-hidden bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-lg border-l-4 border-gradient-to-b from-primary-500 to-purple-500 hover:shadow-xl transition-all"
                style={{ borderLeftColor: campaign.status === 'Complete' ? '#10b981' : campaign.status === 'Failed' ? '#ef4444' : '#6366f1' }}
              >
                {/* Gradient Background Accent */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary-500/5 to-purple-500/5 rounded-full -mr-32 -mt-32" />
                
                <div className="relative">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {statusInfo.icon && (
                          <div className={`p-2 rounded-lg ${statusInfo.color.replace('bg-gradient-to-r', 'bg')} text-white`}>
                            {statusInfo.icon}
                          </div>
                        )}
                        <p className="font-bold text-xl text-gray-900 dark:text-white">
                    {campaign.goal}
                  </p>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {campaign.niche && `${campaign.niche} • `}
                        {campaign.createdAt && new Date(campaign.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className="px-4 py-1.5 text-sm font-bold text-white rounded-full shadow-md"
                        style={{ 
                          background: campaign.status === 'Complete' 
                            ? 'linear-gradient(to right, #10b981, #059669)'
                            : campaign.status === 'Failed'
                            ? 'linear-gradient(to right, #ef4444, #dc2626)'
                            : 'linear-gradient(to right, #6366f1, #8b5cf6)'
                        }}
                      >
                        {campaign.status}
                      </span>
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {campaign.generatedPosts || 0} / {campaign.totalPosts || 0} posts
                  </span>
                </div>
                  </div>

                  {/* Enhanced Progress Bar */}
                  <div className="mb-4">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden shadow-inner">
                      <div
                        className={`${statusInfo.color} h-3 rounded-full transition-all duration-700 ease-out shadow-lg relative overflow-hidden`}
                        style={{ width: `${campaign.progress || 0}%` }}
                      >
                        {isGenerating && (
                          <div className="absolute inset-0 bg-white/20 animate-pulse" />
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-center mt-3 font-semibold text-gray-600 dark:text-gray-300">
                    {statusInfo.text}
                  </p>
                  </div>

                  {/* Additional Info */}
                  {(campaign.plan || campaign.status !== 'Strategizing') && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCampaignForDetail(campaign);
                        }}
                        className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium flex items-center gap-1"
                      >
                        View Campaign Details →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl shadow-md border-2 border-dashed border-gray-300 dark:border-gray-700">
            <div className="mx-auto w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
              <RocketIcon />
            </div>
            <p className="text-lg text-gray-500 dark:text-gray-400 font-medium">
              No active campaigns. Launch one to get started!
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
              Select an idea above or create your own campaign goal
            </p>
          </div>
        )}
      </div>

      {/* Campaign Detail Modal */}
      <AutopilotCampaignDetailModal
        isOpen={!!selectedCampaignForDetail}
        onClose={() => setSelectedCampaignForDetail(null)}
        campaign={selectedCampaignForDetail}
        posts={posts}
        onNavigateToPost={(postId) => {
          setSelectedCampaignForDetail(null);
          setActivePage('approvals');
          // Post will be highlighted in Approvals page
        }}
      />
    </div>
  );
};

export default Autopilot;
