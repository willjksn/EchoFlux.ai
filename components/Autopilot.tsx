import React, { useState, useEffect } from "react";
import { useAppContext } from "./AppContext";
import { AutopilotStatus } from "../types";
import {
  RocketIcon,
  BriefcaseIcon,
  RefreshIcon,
} from "./icons/UIIcons";
import { generateAutopilotSuggestions } from "../src/services/geminiService";

const Autopilot: React.FC = () => {
  const {
    user,
    autopilotCampaigns,
    addAutopilotCampaign,
    showToast,
  } = useAppContext();

  const [selectedIdea, setSelectedIdea] = useState("");
  const [customGoal, setCustomGoal] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedIdeas, setSuggestedIdeas] = useState<string[]>([]);
  const [isFetchingIdeas, setIsFetchingIdeas] = useState(true);

  if (!user) return null;

  const isBusiness = user.userType === "Business";
  const nicheOrIndustry = isBusiness ? user.businessType : user.niche;
  const audience = user.audience || "their target audience";

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

      if (!Array.isArray(ideas)) throw new Error("Invalid AI response");

      setSuggestedIdeas(ideas);
    } catch (err) {
      console.error("Failed to fetch suggestions:", err);
      showToast("Couldn't generate fresh ideas right now.", "error");

      setSuggestedIdeas(
        isBusiness
          ? ["Promote a Weekly Special", "Highlight a 5-Star Review"]
          : ["Promote a New Video", "Announce a Collaboration"]
      );
    } finally {
      setIsFetchingIdeas(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, [user.userType]);

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
    try {
      await addAutopilotCampaign({
        goal,
        niche: nicheOrIndustry || "General",
        audience: audience,
        status: "Strategizing",
      });

      setSelectedIdea("");
      setCustomGoal("");

      showToast("Campaign launched! The AI is now working.", "success");
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
  const getStatusInfo = (status: AutopilotStatus) => {
    switch (status) {
      case "Strategizing":
        return {
          color: "bg-blue-500",
          text: "AI is building your content plan...",
        };
      case "Generating Content":
        return {
          color: "bg-purple-500",
          text: "AI is creating posts...",
        };
      case "Complete":
        return {
          color: "bg-green-500",
          text: "Campaign complete. Posts are in your Approval queue.",
        };
      case "Failed":
        return {
          color: "bg-red-500",
          text: "Campaign failed. Please try again.",
        };
      default:
        return { color: "bg-gray-400", text: "Idle" };
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* HEADER */}
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 mb-4">
          {isBusiness ? <BriefcaseIcon /> : <RocketIcon />}
        </div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
          {isBusiness ? "AI Marketing Manager" : "AI Content Assistant"}
        </h2>
        <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">
          {isBusiness
            ? "Select a marketing campaign and let the AI handle the execution."
            : "Choose a content campaign and let your AI assistant do the work."}
        </p>
      </div>

      {/* LAUNCH CAMPAIGN BOX */}
      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Launch a New Campaign
        </h3>

        {/* Custom Goal */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Define Your Own Goal
          </label>
          <textarea
            value={customGoal}
            onChange={(e) => {
              setCustomGoal(e.target.value);
              setSelectedIdea("");
            }}
            placeholder="e.g., Run a 2-week hype campaign for my new sneaker drop"
            rows={2}
            className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-primary-500 dark:text-white"
          />
        </div>

        {/* OR Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-grow h-px bg-gray-200 dark:bg-gray-700"></div>
          <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
            OR
          </span>
          <div className="flex-grow h-px bg-gray-200 dark:bg-gray-700"></div>
        </div>

        {/* AI Suggestions */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Select an AI-Generated Idea
            </label>

            <button
              onClick={fetchSuggestions}
              disabled={isFetchingIdeas}
              className="text-xs text-primary-600 hover:underline flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshIcon className={`w-3 h-3 ${isFetchingIdeas ? "animate-spin" : ""}`} />
              Refresh Ideas
            </button>
          </div>

          {/* SAFE: always array */}
          {isFetchingIdeas ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Generating fresh ideas...
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
                  className={`p-4 border-2 rounded-lg text-left font-semibold transition-colors ${
                    selectedIdea === idea
                      ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                      : "border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  }`}
                >
                  {idea}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Launch Button */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={handleLaunch}
            disabled={isLoading || (!selectedIdea && !customGoal.trim())}
            className="px-8 py-3 bg-gradient-to-r from-primary-600 to-primary-500 text-white font-bold rounded-full shadow-lg hover:shadow-xl transform transition hover:-translate-y-1 disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading ? "Launching..." : (
              <>
                <RocketIcon /> Launch Campaign
              </>
            )}
          </button>
        </div>
      </div>

      {/* ACTIVE CAMPAIGNS */}
      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
          Active Campaigns
        </h3>

        {autopilotCampaigns.length > 0 ? (
          autopilotCampaigns.map((campaign) => {
            const statusInfo = getStatusInfo(campaign.status);

            return (
              <div
                key={campaign.id}
                className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border-l-4 border-primary-500"
              >
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                  <p className="font-bold text-lg text-gray-900 dark:text-white">
                    {campaign.goal}
                  </p>

                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    Generated {campaign.generatedPosts} / {campaign.totalPosts} posts
                  </span>
                </div>

                <div className="mt-4">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div
                      className={`${statusInfo.color} h-2.5 rounded-full transition-all duration-500`}
                      style={{ width: `${campaign.progress}%` }}
                    ></div>
                  </div>

                  <p className="text-xs text-center mt-2 font-semibold text-gray-600 dark:text-gray-300 animate-pulse">
                    {statusInfo.text}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl shadow-md border-2 border-dashed border-gray-300 dark:border-gray-700">
            <p className="text-gray-500 dark:text-gray-400">
              No active campaigns. Launch one to get started!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Autopilot;

