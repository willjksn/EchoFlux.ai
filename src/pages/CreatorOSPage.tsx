import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAppContext } from "../../components/AppContext";
import { hasCreatorOSAccess } from "../utils/planAccess";
import { db } from "../../firebaseConfig";
import { sendToDraft, sendToDrop } from "../services/premiumStudioSendTo";
import type { Platform } from "../../types";
import type { AmazonLink, ContentIdea, CreatorOSSettings, CreatorOSTrend, InnerCircleFunnel as InnerCircleFunnelData, TodaysMove, WeeklyPlan, WeeklyPlanDayKey } from "../types/creatorOS";
import {
  createAmazonLink,
  createContentIdea,
  defaultCreatorOSSettings,
  findAmazonProductTrends,
  generateDefaultWeeklyPlan,
  generateTodaysMove,
  getCreatorOSSettings,
  getCurrentWeeklyPlan,
  getInnerCircleFunnel,
  getTodaysMove,
  listAmazonLinks,
  listContentIdeas,
  listCreatorOSTrends,
  saveCreatorOSSettings,
  saveCreatorOSTrend,
  saveInnerCircleFunnel,
  saveTodaysMove,
  saveTrendToAmazonLibrary,
  saveWeeklyPlan,
  turnTrendIntoContentIdea,
  updateAmazonLink,
  updateContentIdea,
  updateCreatorOSTrend,
  deleteAmazonLink,
  deleteContentIdea,
} from "../lib/creatorOS";
import { CreatorOSLockedState } from "../components/creator-os/CreatorOSLockedState";
import { CreatorOSHeader } from "../components/creator-os/CreatorOSHeader";
import { BuildMoneyFlowSetup } from "../components/creator-os/BuildMoneyFlowSetup";
import { TodaysMoveCard } from "../components/creator-os/TodaysMoveCard";
import { TodaysFocusCard } from "../components/creator-os/TodaysFocusCard";
import { MonetizationFlowBoard } from "../components/creator-os/MonetizationFlowBoard";
import { ContentIdeaModal } from "../components/creator-os/ContentIdeaModal";
import { WeeklyPlanView } from "../components/creator-os/WeeklyPlanView";
import { AmazonLinkLibrary } from "../components/creator-os/AmazonLinkLibrary";
import { AmazonLinkModal } from "../components/creator-os/AmazonLinkModal";
import { InnerCircleFunnel } from "../components/creator-os/InnerCircleFunnel";
import { TrendFindsPanel } from "../components/creator-os/TrendFindsPanel";
import { ProductShotIdeaBox } from "../components/creator-os/ProductShotIdeaBox";

function currentDayKey(): WeeklyPlanDayKey {
  const key = new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  return (["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].includes(key) ? key : "monday") as WeeklyPlanDayKey;
}

export default function CreatorOSPage() {
  const { user, setActivePage, showToast, setComposeContext } = useAppContext();
  const uid = user?.id || "";
  const hasAccess = hasCreatorOSAccess(user);

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<CreatorOSSettings | null>(null);
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [amazonLinks, setAmazonLinks] = useState<AmazonLink[]>([]);
  const [trends, setTrends] = useState<CreatorOSTrend[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan | null>(null);
  const [todaysMove, setTodaysMove] = useState<TodaysMove | null>(null);
  const [funnel, setFunnel] = useState<InnerCircleFunnelData | null>(null);
  const [error, setError] = useState("");
  const [trendError, setTrendError] = useState("");
  const [findingTrends, setFindingTrends] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [ideaModalOpen, setIdeaModalOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState<ContentIdea | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<AmazonLink | null>(null);

  const effectiveSettings = settings || defaultCreatorOSSettings();

  const recomputeTodaysMove = useCallback((nextSettings = effectiveSettings, plan = weeklyPlan, links = amazonLinks, trendList = trends) => {
    const move = generateTodaysMove(nextSettings, plan, links, trendList);
    setTodaysMove(move);
    return move;
  }, [amazonLinks, effectiveSettings, trends, weeklyPlan]);

  const load = useCallback(async () => {
    if (!uid || !hasAccess) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [loadedSettings, loadedIdeas, loadedLinks, loadedTrends, loadedPlan, loadedFunnel, loadedTodaysMove] = await Promise.all([
        getCreatorOSSettings(uid),
        listContentIdeas(uid),
        listAmazonLinks(uid),
        listCreatorOSTrends(uid),
        getCurrentWeeklyPlan(uid),
        getInnerCircleFunnel(uid),
        getTodaysMove(uid),
      ]);
      const nextSettings = loadedSettings || defaultCreatorOSSettings();
      const nextPlan = loadedPlan || generateDefaultWeeklyPlan(nextSettings, loadedTrends, loadedLinks);
      const nextMove = loadedTodaysMove || generateTodaysMove(nextSettings, nextPlan, loadedLinks, loadedTrends);
      if (!loadedTodaysMove) {
        await saveTodaysMove(uid, nextMove);
      }
      setSettings(loadedSettings);
      setIdeas(loadedIdeas);
      setAmazonLinks(loadedLinks);
      setTrends(loadedTrends);
      setWeeklyPlan(nextPlan);
      setFunnel(loadedFunnel);
      setTodaysMove(nextMove);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creator OS could not load.");
    } finally {
      setLoading(false);
    }
  }, [hasAccess, uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const focusItems = useMemo(() => {
    const checklist = todaysMove?.checklist || [];
    const linkedProduct = todaysMove?.suggestedAmazonLinkId
      ? amazonLinks.find((link) => link.id === todaysMove.suggestedAmazonLinkId)?.productName
      : todaysMove?.suggestedAmazonCategory;
    return [
      {
        id: "public",
        label: todaysMove?.publicPost ? `Post: ${todaysMove.publicPost}` : "Post one curiosity clip",
        completed: checklist.find((item) => item.id === "ig")?.completed || false,
      },
      {
        id: "story",
        label: linkedProduct ? `Story link: ${linkedProduct}` : "Add one story with a soft product link",
        completed: checklist.find((item) => item.id === "story")?.completed || false,
      },
      {
        id: "inner",
        label: todaysMove?.innerCircleDrop ? `Inner Circle: ${todaysMove.innerCircleDrop}` : "Drop one closer post inside Inner Circle",
        completed: checklist.find((item) => item.id === "inner")?.completed || false,
      },
    ];
  }, [amazonLinks, todaysMove]);

  if (!hasAccess) {
    return <CreatorOSLockedState onUpgrade={() => setActivePage("pricing")} />;
  }

  const saveSettings = async (next: CreatorOSSettings) => {
    await saveCreatorOSSettings(uid, next);
    const plan = generateDefaultWeeklyPlan(next, trends, amazonLinks);
    const move = generateTodaysMove(next, plan, amazonLinks, trends);
    await Promise.all([saveWeeklyPlan(uid, plan), saveTodaysMove(uid, move)]);
    setSettings(next);
    setWeeklyPlan(plan);
    setTodaysMove(move);
    showToast("Creator OS setup saved.", "success");
  };

  const planMyWeek = async () => {
    const plan = generateDefaultWeeklyPlan(effectiveSettings, trends, amazonLinks);
    setWeeklyPlan(plan);
    await saveWeeklyPlan(uid, plan);
    showToast("Weekly plan generated.", "success");
  };

  const findTrends = async () => {
    setFindingTrends(true);
    setTrendError("");
    try {
      const found = await findAmazonProductTrends(uid, effectiveSettings, amazonLinks.map((link) => link.category));
      if (found.length === 0) {
        setTrendError("Trend search is unavailable right now. You can still plan your week manually.");
        return;
      }
      await Promise.all(found.map((trend) => saveCreatorOSTrend(uid, trend)));
      setTrends((prev) => {
        const map = new Map(prev.map((trend) => [trend.id, trend]));
        found.forEach((trend) => map.set(trend.id, trend));
        return Array.from(map.values());
      });
      showToast("Amazon product trends found.", "success");
    } catch (err) {
      setTrendError(err instanceof Error ? err.message : "Trend search is unavailable right now. You can still plan your week manually.");
    } finally {
      setFindingTrends(false);
    }
  };

  const saveIdea = async (idea: Omit<ContentIdea, "id">, ideaId?: string) => {
    if (ideaId) {
      await updateContentIdea(uid, ideaId, idea);
      setIdeas((prev) => prev.map((item) => (item.id === ideaId ? { ...item, ...idea } : item)));
    } else {
      const created = await createContentIdea(uid, idea);
      setIdeas((prev) => [created, ...prev]);
    }
    showToast("Content idea saved.", "success");
  };

  const saveLink = async (link: Omit<AmazonLink, "id">, linkId?: string) => {
    if (linkId) {
      await updateAmazonLink(uid, linkId, link);
      setAmazonLinks((prev) => prev.map((item) => (item.id === linkId ? { ...item, ...link } : item)));
    } else {
      const created = await createAmazonLink(uid, link);
      setAmazonLinks((prev) => [created, ...prev]);
    }
    showToast("Amazon link saved.", "success");
  };

  const saveMoveAsIdea = async () => {
    if (!todaysMove) return;
    const idea = await createContentIdea(uid, {
      title: todaysMove.hook,
      lane: todaysMove.suggestedAmazonCategory.toLowerCase().includes("car") ? "car_driving" : "amazon_soft_mention",
      publicHook: todaysMove.hook,
      caption: todaysMove.caption,
      platforms: todaysMove.platforms,
      funnelGoal: "drive_story_clicks",
      ...(todaysMove.suggestedAmazonLinkId ? { amazonLinkId: todaysMove.suggestedAmazonLinkId } : {}),
      amazonCategory: todaysMove.suggestedAmazonCategory,
      storyText: todaysMove.storyLinkPlan,
      innerCircleTieIn: todaysMove.innerCircleDrop,
      notes: todaysMove.whyThisWorks,
      dueDate: todaysMove.date,
      status: "ideas",
    });
    setIdeas((prev) => [idea, ...prev]);
    showToast("Today's Move saved as an idea.", "success");
  };

  const addMoveToWeeklyPlan = async () => {
    if (!todaysMove || !weeklyPlan) return;
    const day = currentDayKey();
    const next = {
      ...weeklyPlan,
      days: {
        ...weeklyPlan.days,
        [day]: {
          ...weeklyPlan.days[day],
          publicPost: todaysMove.publicPost,
          storyLink: todaysMove.suggestedAmazonCategory,
          innerCircleDrop: todaysMove.innerCircleDrop,
        },
      },
    };
    setWeeklyPlan(next);
    await saveWeeklyPlan(uid, next);
    showToast("Added to this week's plan.", "success");
  };

  const toggleChecklist = async (id: string) => {
    if (!todaysMove) return;
    const next = {
      ...todaysMove,
      checklist: todaysMove.checklist.map((item) => item.id === id ? { ...item, completed: !item.completed } : item),
    };
    next.completed = next.checklist.every((item) => item.completed);
    setTodaysMove(next);
    await saveTodaysMove(uid, next);
  };

  const updateTrend = async (trendId: string, updates: Partial<CreatorOSTrend>) => {
    await updateCreatorOSTrend(uid, trendId, updates);
    setTrends((prev) => prev.map((trend) => (trend.id === trendId ? { ...trend, ...updates } : trend)));
  };

  const isPlanningInstruction = (text?: string): boolean => {
    if (!text) return false;
    return /^(use this|post|film|add|drop|share|make|create|turn this)\b/i.test(text.trim());
  };

  const formatPublicCaption = (hook: string, caption?: string, cta?: string, closingPrompt?: string): string => {
    const cleanHook = hook.trim();
    const cleanCaption = caption?.trim();
    const cleanCta = cta?.trim();
    const cleanClosingPrompt = closingPrompt?.trim();

    return [
      cleanHook ? `👀 ${cleanHook}` : "",
      cleanCaption ? `${cleanCaption}` : "",
      cleanCta ? `✨ ${cleanCta}` : "",
      cleanClosingPrompt ? `💬 ${cleanClosingPrompt}` : "",
    ].filter(Boolean).join("\n\n");
  };

  const moveCaption = (move: TodaysMove): string => {
    const link = move.suggestedAmazonLinkId ? amazonLinks.find((item) => item.id === move.suggestedAmazonLinkId) : null;
    const hook = isPlanningInstruction(move.hook)
      ? link
        ? `I did not think I needed this ${link.productName} until now`
        : `I did not think I needed this until now`
      : move.hook;
    const cta = link
      ? `I linked the ${link.productName} in my Story if you want it.`
      : move.suggestedAmazonCategory
        ? `Check my Story if you want the ${move.suggestedAmazonCategory.toLowerCase()} angle.`
        : "Tell me if you get it.";
    const closingPrompt = link || move.suggestedAmazonCategory
      ? "Should I keep sharing finds like this?"
      : "Tell me if you get it.";

    return formatPublicCaption(hook, move.caption, cta, closingPrompt);
  };

  const ideaCreatePostCaption = (idea: ContentIdea): string => {
    const link = idea.amazonLinkId ? amazonLinks.find((item) => item.id === idea.amazonLinkId) : null;
    const hook = isPlanningInstruction(idea.publicHook) ? idea.title : (idea.publicHook || idea.title);
    const cta = link
      ? `I linked the ${link.productName} in my Story if you want it.`
      : idea.amazonCategory
        ? `Check my Story if you want the ${idea.amazonCategory.toLowerCase()} angle.`
        : idea.innerCircleTieIn
          ? "I put the closer version in Inner Circle."
          : "";
    const closingPrompt = link || idea.amazonCategory
      ? "Would you actually use this?"
      : idea.innerCircleTieIn
        ? "Want the closer version?"
        : "Do you get what I mean?";

    return formatPublicCaption(hook, idea.caption, cta, closingPrompt);
  };

  const ideaMyPageContent = (idea: ContentIdea): string => {
    const link = idea.amazonLinkId ? amazonLinks.find((item) => item.id === idea.amazonLinkId) : null;
    const amazonText = link
      ? `\n\nAmazon link: ${link.productName}\n${link.amazonUrl}`
      : idea.amazonCategory
        ? `\n\nAmazon angle: ${idea.amazonCategory}`
        : "";
    return `${idea.publicHook || idea.title}\n\n${idea.caption || ""}${idea.storyText?.length ? `\n\nStory: ${idea.storyText.join(" / ")}` : ""}${amazonText}${idea.innerCircleTieIn ? `\n\nInner Circle: ${idea.innerCircleTieIn}` : ""}`.trim();
  };

  const stageCreatePostDraft = (draft: { id: string; content: string; platforms: Platform[]; title?: string }) => {
    const draftJson = JSON.stringify({
      id: draft.id,
      content: draft.content,
      platforms: draft.platforms,
      postGoal: "engagement",
      postTone: effectiveSettings.brandTone || "friendly",
      mediaType: "image",
      instagramPostType: "Reel",
      title: draft.title,
    });
    localStorage.setItem("draftPostToEdit", draftJson);
    try {
      sessionStorage.setItem("draftPostToEdit", draftJson);
    } catch {
      // Session storage can be unavailable in privacy-restricted contexts.
    }
  };

  const sendMoveToCreatePost = async () => {
    if (!todaysMove) return;
    const content = moveCaption(todaysMove);
    const { postId } = await sendToDraft(db, uid, {
      content,
      platforms: ["Instagram"] as Platform[],
      author: { name: user?.name || "Creator", avatar: user?.avatar || "" },
    });
    stageCreatePostDraft({ id: postId, content, platforms: ["Instagram"], title: todaysMove.publicPost });
    setComposeContext({
      topic: todaysMove.publicPost,
      platform: "Instagram",
      type: "Reel",
      captionText: content,
    });
    setActivePage("compose");
    showToast("Sent to Create Post. Add media, then publish or schedule to Instagram.", "success");
  };

  const publishMoveToMyPage = async () => {
    if (!todaysMove) return;
    const { dropId } = await sendToDrop(db, uid, {
      content: `${todaysMove.innerCircleDrop}\n\n${todaysMove.innerCircleCaption}`,
      visibility: "free",
      title: todaysMove.hook,
    });
    await saveTodaysMove(uid, { ...todaysMove, completed: true });
    showToast(`Posted to My Page (${dropId}).`, "success");
  };

  const sendIdeaToCreatePost = async (idea: ContentIdea) => {
    const content = ideaCreatePostCaption(idea);
    const { postId } = await sendToDraft(db, uid, {
      content,
      platforms: ["Instagram"] as Platform[],
      author: { name: user?.name || "Creator", avatar: user?.avatar || "" },
    });
    stageCreatePostDraft({ id: postId, content, platforms: ["Instagram"], title: idea.title });
    await updateContentIdea(uid, idea.id, { status: "ready_to_post" });
    setIdeas((prev) => prev.map((item) => (item.id === idea.id ? { ...item, status: "ready_to_post" } : item)));
    setComposeContext({
      topic: idea.title,
      platform: "Instagram",
      type: "Reel",
      captionText: content,
    });
    setActivePage("compose");
    showToast("Sent to Create Post. Add media, then auto-post or schedule to Instagram.", "success");
  };

  const publishIdeaToMyPage = async (idea: ContentIdea) => {
    const { dropId } = await sendToDrop(db, uid, {
      content: ideaMyPageContent(idea),
      visibility: "free",
      title: idea.title,
    });
    await updateContentIdea(uid, idea.id, { status: "posted" });
    setIdeas((prev) => prev.map((item) => (item.id === idea.id ? { ...item, status: "posted" } : item)));
    showToast(`Posted to My Page (${dropId}).`, "success");
  };

  const saveProductShotIdea = async (ideaText: string) => {
    const idea = await createContentIdea(uid, {
      title: "AI product shot idea",
      lane: "amazon_soft_mention",
      publicHook: "random but useful",
      caption: ideaText,
      platforms: ["instagram_story", "instagram_reel", "tiktok"],
      funnelGoal: "test_product_interest",
      storyText: ideaText.split("\n").filter(Boolean).slice(0, 3),
      innerCircleTieIn: "Use the closer version as an Inner Circle follow-up if the Story gets replies.",
      notes: ideaText,
      dueDate: "",
      status: "ideas",
    });
    setIdeas((prev) => [idea, ...prev]);
    showToast("Product shot idea saved.", "success");
  };

  return (
    <div className="min-h-full bg-gray-50 p-4 text-gray-900 dark:bg-gray-900 dark:text-gray-100 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <CreatorOSHeader
          onOpenSetup={() => setSetupOpen(true)}
          onAddIdea={() => { setEditingIdea(null); setIdeaModalOpen(true); }}
          onPlanWeek={planMyWeek}
          onFindTrends={findTrends}
          isFindingTrends={findingTrends}
        />

        {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">{error}</div>}
        {loading ? (
          <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-gray-500 shadow-md dark:border-gray-700 dark:bg-gray-800">Loading Creator OS...</div>
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
              <TodaysMoveCard
                move={todaysMove}
                onSaveAsIdea={saveMoveAsIdea}
                onAddToWeeklyPlan={addMoveToWeeklyPlan}
                onMarkDone={async () => {
                  if (!todaysMove) return;
                  const next = { ...todaysMove, completed: true, checklist: todaysMove.checklist.map((item) => ({ ...item, completed: true })) };
                  setTodaysMove(next);
                  await saveTodaysMove(uid, next);
                }}
                onSendToCreatePost={sendMoveToCreatePost}
                onPublishToMyPage={publishMoveToMyPage}
                onRegenerate={async () => {
                  const move = recomputeTodaysMove();
                  await saveTodaysMove(uid, move);
                }}
                onToggleChecklist={toggleChecklist}
              />
              <TodaysFocusCard items={focusItems} onToggle={(id) => toggleChecklist(id === "public" ? "ig" : id)} />
            </div>

            <MonetizationFlowBoard
              ideas={ideas}
              amazonLinks={amazonLinks}
              onAddIdea={() => { setEditingIdea(null); setIdeaModalOpen(true); }}
              onEditIdea={(idea) => { setEditingIdea(idea); setIdeaModalOpen(true); }}
              onDeleteIdea={async (ideaId) => {
                await deleteContentIdea(uid, ideaId);
                setIdeas((prev) => prev.filter((idea) => idea.id !== ideaId));
              }}
              onSendToCreatePost={sendIdeaToCreatePost}
              onPublishToMyPage={publishIdeaToMyPage}
              onUpdateIdea={async (ideaId, updates) => {
                await updateContentIdea(uid, ideaId, updates);
                setIdeas((prev) => prev.map((idea) => (idea.id === ideaId ? { ...idea, ...updates } : idea)));
              }}
            />

            <WeeklyPlanView
              plan={weeklyPlan}
              onChange={setWeeklyPlan}
              onSave={async (plan) => {
                await saveWeeklyPlan(uid, plan);
                showToast("Weekly plan saved.", "success");
              }}
              onGenerate={planMyWeek}
            />

            <ProductShotIdeaBox
              settings={effectiveSettings}
              amazonLinks={amazonLinks}
              creatorProfile={{
                creatorGender: user?.creatorGender,
                niche: user?.niche,
                audience: user?.audience,
                creatorGoal: user?.creatorGoal,
              }}
              onSaveAsIdea={saveProductShotIdea}
            />

            <TrendFindsPanel
              trends={trends}
              loading={findingTrends}
              error={trendError}
              onFind={findTrends}
              onTurnIntoIdea={async (trend) => {
                const idea = await turnTrendIntoContentIdea(uid, trend);
                setIdeas((prev) => [idea, ...prev]);
                setTrends((prev) => prev.map((item) => item.id === trend.id ? { ...item, status: "saved_to_ideas" } : item));
              }}
              onSaveToLibrary={async (trend) => {
                const link = await saveTrendToAmazonLibrary(uid, trend);
                setAmazonLinks((prev) => [link, ...prev]);
                setTrends((prev) => prev.map((item) => item.id === trend.id ? { ...item, status: "saved_to_amazon_library" } : item));
              }}
              onUpdate={updateTrend}
            />

            <AmazonLinkLibrary
              links={amazonLinks}
              onAdd={() => { setEditingLink(null); setLinkModalOpen(true); }}
              onEdit={(link) => { setEditingLink(link); setLinkModalOpen(true); }}
              onDelete={async (linkId) => {
                await deleteAmazonLink(uid, linkId);
                setAmazonLinks((prev) => prev.filter((link) => link.id !== linkId));
              }}
              onTurnIntoIdea={async (link) => {
                const idea = await createContentIdea(uid, {
                  title: link.productName,
                  lane: link.category.toLowerCase().includes("car") ? "car_driving" : "amazon_soft_mention",
                  publicHook: "why is this actually useful...",
                  caption: "ok I get it now",
                  platforms: ["instagram_story", "tiktok"],
                  funnelGoal: "test_product_interest",
                  amazonLinkId: link.id,
                  amazonCategory: link.category,
                  storyText: ["why is this actually useful...", "I didn't think I needed it", "ok... I get it now"],
                  innerCircleTieIn: "Share the closer version inside Inner Circle.",
                  notes: link.bestContentSituation,
                  dueDate: "",
                  status: "ideas",
                });
                setIdeas((prev) => [idea, ...prev]);
              }}
              onUpdate={async (linkId, updates) => {
                await updateAmazonLink(uid, linkId, updates);
                setAmazonLinks((prev) => prev.map((link) => (link.id === linkId ? { ...link, ...updates } : link)));
              }}
            />

            <InnerCircleFunnel
              funnel={funnel}
              onSave={async (next) => {
                await saveInnerCircleFunnel(uid, next);
                setFunnel(next);
                showToast("Inner Circle funnel saved.", "success");
              }}
            />
          </>
        )}

        <BuildMoneyFlowSetup open={setupOpen} settings={settings} onClose={() => setSetupOpen(false)} onSave={saveSettings} />
        <ContentIdeaModal open={ideaModalOpen} idea={editingIdea} amazonLinks={amazonLinks} onClose={() => setIdeaModalOpen(false)} onSave={saveIdea} />
        <AmazonLinkModal open={linkModalOpen} link={editingLink} onClose={() => setLinkModalOpen(false)} onSave={saveLink} />
      </div>
    </div>
  );
}

