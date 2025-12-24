import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
  useMemo,
} from "react";

import {
  Settings,
  TeamMember,
  Client,
  Notification,
  CustomVoice,
  ComposeState,
  Message,
  HashtagSet,
  CRMProfile,
  CRMNote,
  Post,
  BioPageConfig,
  EmailCaptureConfig,
  CalendarEvent,
  AutopilotCampaign,
  MessageCategory,
  SocialAccount,
  Platform,
} from "../../types";

import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  arrayUnion,
  arrayRemove,
  query,
  orderBy,
} from "firebase/firestore";

import { db } from "../../firebaseConfig";
import { useAuth } from "./AuthContext";
import { useUI } from "./UIContext";

import {
  defaultSettings,
  MOCK_MESSAGES,
  MOCK_NOTIFICATIONS,
  MOCK_CLIENTS,
  MOCK_TEAM_MEMBERS,
  MOCK_POSTS,
} from "../../constants";

import { categorizeMessage } from "../../src/services/geminiService";
import { checkAllUsageLimits } from "../../src/utils/usageNotifications";


/*--------------------------------------------------------------------
  TYPE
--------------------------------------------------------------------*/
interface DataContextType {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;

  clients: Client[];
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
  teamMembers: TeamMember[];
  setTeamMembers: React.Dispatch<React.SetStateAction<TeamMember[]>>;
  selectedClient: Client | null;
  setSelectedClient: React.Dispatch<React.SetStateAction<Client | null>>;

  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;

  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  updateMessage: (id: string, data: Partial<Message>) => void;
  deleteMessage: (id: string) => void;
  categorizeAllMessages: () => void;

  posts: Post[];
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  updatePost: (post: Post) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;

  calendarEvents: CalendarEvent[];
  setCalendarEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  addCalendarEvent: (event: CalendarEvent) => Promise<void>;

  crmStore: Record<string, CRMProfile>;
  addCRMNote: (profileId: string, content: string) => Promise<void>;
  addCRMTag: (profileId: string, tag: string) => Promise<void>;
  removeCRMTag: (profileId: string, tag: string) => Promise<void>;
  updateCRMProfile: (profileId: string, data: Partial<CRMProfile>) => Promise<void>;
  ensureCRMProfile: (user: { name: string; avatar: string }) => Promise<void>;

  userBaseImage: { data: string; mimeType: string } | null;
  setUserBaseImage: React.Dispatch<React.SetStateAction<{ data: string; mimeType: string } | null>>;

  userCustomVoices: CustomVoice[];
  setUserCustomVoices: React.Dispatch<React.SetStateAction<CustomVoice[]>>;

  composeState: ComposeState;
  setComposeState: React.Dispatch<React.SetStateAction<ComposeState>>;
  hashtagSets: HashtagSet[];
  setHashtagSets: React.Dispatch<React.SetStateAction<HashtagSet[]>>;

  bioPage: BioPageConfig;
  setBioPage: React.Dispatch<React.SetStateAction<BioPageConfig>>;
  saveBioPage: (config: BioPageConfig) => Promise<void>;

  autopilotCampaigns: AutopilotCampaign[];
  addAutopilotCampaign: (
    data: Omit<
      AutopilotCampaign,
      "id" | "createdAt" | "progress" | "totalPosts" | "generatedPosts"
    >
  ) => Promise<string>; // Returns campaign ID
  updateAutopilotCampaign: (campaignId: string, data: Partial<AutopilotCampaign>) => Promise<void>;

  socialAccounts: Record<Platform, SocialAccount | null>;
}

/*--------------------------------------------------------------------
  CONTEXT
--------------------------------------------------------------------*/
const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, setUser } = useAuth();
  const { showToast } = useUI();

  /*--------------------------------------------------------------------
    STATE
  --------------------------------------------------------------------*/
  const [clients, setClients] = useState<Client[]>(MOCK_CLIENTS);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(MOCK_TEAM_MEMBERS);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);

  const [messages, setMessages] = useState<Message[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [lastUserId, setLastUserId] = useState<string | null>(null);

  const [crmStore, setCrmStore] = useState<Record<string, CRMProfile>>({});
  const [userCustomVoices, setUserCustomVoices] = useState<CustomVoice[]>([]);
  const [autopilotCampaigns, setAutopilotCampaigns] = useState<AutopilotCampaign[]>([]);

  const [userBaseImage, setUserBaseImage] =
    useState<{ data: string; mimeType: string } | null>(null);

  const [composeState, setComposeState] = useState<ComposeState>({
    media: null,
    mediaItems: [],
    results: [],
    captionText: "",
    postGoal: "engagement",
    postTone: "friendly",
  });

  const [hashtagSets, setHashtagSets] = useState<HashtagSet[]>([]);
  const [bioPage, setBioPageState] = useState<BioPageConfig | null>(null);
  const [socialAccounts, setSocialAccounts] = useState<Record<Platform, SocialAccount | null>>({
    Instagram: null,
    TikTok: null,
    X: null,
    Threads: null,
    YouTube: null,
    LinkedIn: null,
    Facebook: null,
    Pinterest: null,
  });

  /*--------------------------------------------------------------------
    USAGE LIMIT NOTIFICATIONS
  --------------------------------------------------------------------*/
  // State for usage stats (for strategy notifications)
  const [usageStatsForNotifications, setUsageStatsForNotifications] = useState<{
    strategy: { count: number; limit: number; remaining: number };
  } | null>(null);

  // Fetch usage stats periodically for strategy notifications
  useEffect(() => {
    if (!user?.id) return;

    const fetchUsageStats = async () => {
      try {
        const { auth } = await import('../../firebaseConfig');
        const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
        const response = await fetch('/api/getUsageStats', {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (response.ok) {
          const data = await response.json();
          setUsageStatsForNotifications({ strategy: data.strategy });
        }
      } catch (error) {
        console.error('Failed to fetch usage stats for notifications:', error);
      }
    };

    // Fetch immediately and then every 5 minutes
    fetchUsageStats();
    const interval = setInterval(fetchUsageStats, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user?.id]);

  // Check usage limits when user data changes
  useEffect(() => {
    if (!user) return;

    // Check for usage limit notifications using functional update to avoid dependency issues
    setNotifications(prevNotifications => {
      const newNotifications = checkAllUsageLimits(user, prevNotifications, usageStatsForNotifications);
      
      if (newNotifications.length > 0) {
        // Add new notifications, avoiding duplicates
        const existingIds = new Set(prevNotifications.map(n => n.id));
        const toAdd = newNotifications.filter(n => !existingIds.has(n.id));
        return [...toAdd, ...prevNotifications];
      }
      
      return prevNotifications;
    });
  }, [user?.monthlyCaptionGenerationsUsed, user?.monthlyImageGenerationsUsed, user?.monthlyVideoGenerationsUsed, user?.plan, user?.id, usageStatsForNotifications]);

  /*--------------------------------------------------------------------
    SEEDING HELPERS
  --------------------------------------------------------------------*/
  const extractId = (item: any, idField: string): string => {
    if (item && typeof item === "object" && typeof item[idField] === "string") {
      return item[idField];
    }
    return String(Date.now() + Math.random());
  };

  /*--------------------------------------------------------------------
    FIRESTORE LISTENERS
  --------------------------------------------------------------------*/
  useEffect(() => {
    // Only clear data if user ID actually changed (user logged out or switched)
    // Don't clear if user is just temporarily null during auth state check
    if (!user || !user.id) {
      // Only clear if we had a user before (actual logout), not if it's initial load
      if (lastUserId) {
        setMessages([]);
        setPosts([]);
        setCalendarEvents([]);
        setCrmStore({});
        setUserCustomVoices([]);
        setAutopilotCampaigns([]);
        setSocialAccounts({
          Instagram: null,
          TikTok: null,
          X: null,
          Threads: null,
          YouTube: null,
          LinkedIn: null,
          Facebook: null,
        });
        setLastUserId(null);
      }
      return;
    }

    // If user ID hasn't changed, don't re-establish listeners (they're already active)
    if (lastUserId === user.id) {
      return;
    }

    // User ID changed - update and set up new listeners
    setLastUserId(user.id);

    const subcollections = [
      { name: "messages", setter: setMessages }, // No seed - users start with empty inbox
      { name: "posts", setter: setPosts }, // No seed - users start with empty posts
      { name: "calendar_events", setter: setCalendarEvents },
      {
        name: "crm_profiles",
        setter: (items: any[]) => {
          const obj: Record<string, CRMProfile> = {};
          items.forEach((i) => (obj[i.id] = i));
          setCrmStore(obj);
        },
      },
      { name: "voices", setter: setUserCustomVoices },
      { name: "autopilot_campaigns", setter: setAutopilotCampaigns },
      {
        name: "social_accounts",
        setter: (items: any[]) => {
          const accounts: Record<Platform, SocialAccount | null> = {
            Instagram: null,
            TikTok: null,
            X: null,
            Threads: null,
            YouTube: null,
            LinkedIn: null,
            Facebook: null,
          };
          items.forEach((item) => {
            if (item.platform) {
              accounts[item.platform as Platform] = item as SocialAccount;
            }
          });
          setSocialAccounts(accounts);
        },
      },
    ];

    const unsubscribers = subcollections.map(({ name, setter, seed, seedIdField }) => {
      const collRef = collection(db, "users", user.id, name);
      
      // Different collections have different timestamp/date fields
      let q;
      if (name === "crm_profiles" || name === "social_accounts") {
        // These don't have timestamp fields
        q = query(collRef);
      } else if (name === "calendar_events") {
        // Calendar events use "date" field, not "timestamp"
        // Try to order by date, but fallback to no ordering if index is missing
        try {
          q = query(collRef, orderBy("date", "asc"));
        } catch (err) {
          // If orderBy fails (e.g., missing index), use simple query without ordering
          console.warn("Calendar events orderBy failed, using simple query:", err);
          q = query(collRef);
        }
      } else {
        // Messages, posts, etc. use "timestamp"
        q = query(collRef, orderBy("timestamp", "desc"));
      }

      return onSnapshot(
        q,
        async (snapshot) => {
          // IMPORTANT: Don't seed messages/posts automatically - each user should have their own isolated data
          // Only seed if explicitly needed for demo/testing (you can add a flag like user.isDemoAccount)
          if (snapshot.empty && seed && seedIdField) {
            // Skip seeding for production - users start with empty collections
            // If you want demo data, check: if (user.isDemoAccount && seed && seedIdField) { ... }
            setter([]);
          } else {
            const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            // For calendar events, sort by date if not already sorted
            if (name === "calendar_events") {
              items.sort((a: any, b: any) => {
                const dateA = a.date ? new Date(a.date).getTime() : 0;
                const dateB = b.date ? new Date(b.date).getTime() : 0;
                return dateA - dateB;
              });
            }
            setter(items as any);
          }
        },
        (err) => {
          console.error(`Error fetching ${name}:`, err);
          
          // For calendar_events, if orderBy fails due to missing index, establish fallback listener
          if (name === "calendar_events" && (err.code === "failed-precondition" || err.message?.includes("index"))) {
            console.warn("Calendar events query failed due to missing index, establishing fallback listener");
            const fallbackQ = query(collRef);
            // Establish fallback listener - this will be cleaned up when component unmounts
            onSnapshot(
              fallbackQ,
              (snapshot) => {
                const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
                // Sort manually by date
                items.sort((a: any, b: any) => {
                  const dateA = a.date ? new Date(a.date).getTime() : 0;
                  const dateB = b.date ? new Date(b.date).getTime() : 0;
                  return dateA - dateB;
                });
                setter(items as any);
              },
              (fallbackErr) => {
                console.error(`Fallback query also failed for ${name}:`, fallbackErr);
                // Set empty array on error to prevent stale data
                setter([]);
              }
            );
            return; // Don't proceed with error handling below
          }
          
          // Don't show permission-denied errors to users, but log other errors
          if (err.code !== "permission-denied" && err.code !== "failed-precondition") {
            console.error(`Failed to fetch ${name}:`, err.message);
          }
          // Set empty array on error to prevent stale data showing
          if (err.code === "permission-denied") {
            setter([]);
          }
        }
      );
    });

    if (user.bioPage) setBioPageState(user.bioPage);

    return () => {
      // Clean up all listeners
      unsubscribers.forEach((u) => {
        try {
          u();
        } catch (err) {
          console.warn("Error unsubscribing listener:", err);
        }
      });
    };
  }, [user?.id]); // Only re-run when user.id changes, not when user object reference changes

  /*--------------------------------------------------------------------
    SETTINGS
  --------------------------------------------------------------------*/
  const settings = useMemo(() => {
    return selectedClient?.settings || user?.settings || defaultSettings;
  }, [selectedClient, user]);

  const setSettings = (action: React.SetStateAction<Settings>) => {
    const newSettings = typeof action === "function" ? action(settings) : action;

    if (selectedClient) {
      setClients((p) =>
        p.map((c) => (c.id === selectedClient.id ? { ...c, settings: newSettings } : c))
      );
    } else if (user) {
      setUser({ ...user, settings: newSettings });
    }
  };

  /*--------------------------------------------------------------------
    BIO PAGE CONFIG
  --------------------------------------------------------------------*/
  const bioPageConfig: BioPageConfig = useMemo(() => {
    if (bioPage) {
      // Ensure backward compatibility: migrate legacy links to customLinks if needed
      // Normalize socialLinks to always be an array
      let normalizedSocialLinks: any[] = [];
      if (bioPage.socialLinks) {
        if (Array.isArray(bioPage.socialLinks)) {
          normalizedSocialLinks = bioPage.socialLinks;
        } else if (typeof bioPage.socialLinks === 'object' && bioPage.socialLinks !== null) {
          try {
            normalizedSocialLinks = Object.values(bioPage.socialLinks).filter((item: any) => 
              item && typeof item === 'object' && 'id' in item
            );
          } catch (e) {
            normalizedSocialLinks = [];
          }
        }
      }
      
      // Normalize customLinks to always be an array
      let normalizedCustomLinks: any[] = [];
      if (bioPage.customLinks) {
        if (Array.isArray(bioPage.customLinks)) {
          normalizedCustomLinks = bioPage.customLinks;
        } else if (typeof bioPage.customLinks === 'object' && bioPage.customLinks !== null) {
          try {
            normalizedCustomLinks = Object.values(bioPage.customLinks).filter((item: any) => 
              item && typeof item === 'object' && 'id' in item
            );
          } catch (e) {
            normalizedCustomLinks = [];
          }
        }
      } else if (bioPage.links) {
        if (Array.isArray(bioPage.links)) {
          normalizedCustomLinks = bioPage.links;
        } else if (typeof bioPage.links === 'object' && bioPage.links !== null) {
          try {
            normalizedCustomLinks = Object.values(bioPage.links).filter((item: any) => 
              item && typeof item === 'object' && 'id' in item
            );
          } catch (e) {
            normalizedCustomLinks = [];
          }
        }
      }
      
      if (bioPage.links && !bioPage.customLinks) {
        return {
          ...bioPage,
          customLinks: normalizedCustomLinks,
          links: undefined,
          username: bioPage.username || "",
          verified: bioPage.verified !== undefined ? bioPage.verified : false,
          socialLinks: normalizedSocialLinks,
          totalFollowers: bioPage.totalFollowers || 0,
        };
      }
      // Ensure all new fields exist
      return {
        ...bioPage,
        username: bioPage.username || "",
        verified: bioPage.verified !== undefined ? bioPage.verified : false,
        socialLinks: normalizedSocialLinks,
        customLinks: normalizedCustomLinks,
        totalFollowers: bioPage.totalFollowers || 0,
      };
    }

    const defaultEmail: EmailCaptureConfig = {
      enabled: false,
      title: "Join my list",
      placeholder: "Enter your email",
      buttonText: "Submit",
      successMessage: "Thank you for subscribing!",
      formBackgroundColor: "#ffffff",
      titleColor: "#111827",
      inputBackgroundColor: "#f9fafb",
      inputTextColor: "#111827",
      buttonBackgroundColor: "#111827",
      buttonTextColor: "#ffffff",
    };

    return {
      username: user?.name?.replace(/\s+/g, "").toLowerCase() || "user",
      displayName: user?.name || "My Name",
      verified: false,
      avatar: user?.avatar || "",
      bio: "Welcome!",
      totalFollowers: 0,
      socialLinks: [],
      customLinks: [],
      theme: {
        backgroundColor: "#ffffff",
        pageBackgroundColor: "#f9fafb",
        cardBackgroundColor: "#ffffff",
        buttonColor: "#000000",
        textColor: "#000000",
        buttonStyle: "rounded",
      },
      emailCapture: defaultEmail,
    };
  }, [bioPage, user]);

  /*--------------------------------------------------------------------
    MESSAGES
  --------------------------------------------------------------------*/
  const updateMessage = async (id: string, data: Partial<Message>) => {
    if (!user) return;
    await updateDoc(doc(db, "users", user.id, "messages", id), data).catch(() =>
      showToast("Failed to update message", "error")
    );
  };

  const deleteMessage = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.id, "messages", id))
      .then(() => showToast("Message deleted", "success"))
      .catch(() => showToast("Failed to delete message", "error"));
  };

  const categorizeAllMessages = async () => {
    if (!user) return;

    showToast("Categorizing inbox...", "success");

    let updated = 0;

    for (const msg of messages) {
      if (!msg.category || msg.category === "General") {
        try {
          const category = await categorizeMessage(msg.content);
          if (category && category !== msg.category && category in ['Lead', 'Support', 'Opportunity', 'General', 'Fan Message', 'Question', 'Collab Request', 'Feedback']) {
            await updateMessage(msg.id, { category: category as MessageCategory });
            updated++;
          }
        } catch {}
      }
    }

    if (updated > 0) showToast(`Updated ${updated} messages`, "success");
  };

  /*--------------------------------------------------------------------
    POSTS
  --------------------------------------------------------------------*/
  const updatePost = async (post: Post) => {
    if (!user) return;

    await setDoc(doc(db, "users", user.id, "posts", post.id), post, { merge: true }).catch(() =>
      showToast("Failed to update post", "error")
    );
  };

  const deletePost = async (postId: string) => {
    if (!user) return;

    try {
      await deleteDoc(doc(db, "users", user.id, "posts", postId));
      // Update local state immediately to reflect deletion in UI
      setPosts(prev => prev.filter(p => p.id !== postId));
      showToast("Post deleted", "success");
    } catch (error) {
      console.error("Failed to delete post:", error);
      showToast("Failed to delete post", "error");
    }
  };

  /*--------------------------------------------------------------------
    CALENDAR
  --------------------------------------------------------------------*/
  const addCalendarEvent = async (event: CalendarEvent) => {
    if (!user) return;

    // Remove undefined values to prevent Firestore errors
    const cleanEvent: any = {};
    Object.keys(event).forEach(key => {
      const value = (event as any)[key];
      if (value !== undefined) {
        cleanEvent[key] = value;
      }
    });

    await setDoc(doc(db, "users", user.id, "calendar_events", event.id), cleanEvent)
      .catch(() => showToast("Failed to save event", "error"));
  };

  /*--------------------------------------------------------------------
    BIO PAGE SAVE
  --------------------------------------------------------------------*/
  const saveBioPage = async (config: BioPageConfig) => {
    if (!user) return;

    // Normalize username to ensure consistency (remove @, lowercase, trim)
    const normalizedConfig = {
      ...config,
      username: config.username ? config.username.replace("@", "").toLowerCase().trim() : config.username,
    };

    await updateDoc(doc(db, "users", user.id), { bioPage: normalizedConfig });

    setBioPageState(normalizedConfig);
    showToast("Bio Page Saved!", "success");
  };

  /*--------------------------------------------------------------------
    CRM
  --------------------------------------------------------------------*/
  const ensureCRMProfile = async (target: { name: string; avatar: string }) => {
    if (!user) return;

    const id = target.name;

    if (!crmStore[id]) {
      const profile: CRMProfile = {
        id,
        name: target.name,
        avatar: target.avatar,
        tags: [],
        notes: [],
        lifecycleStage: "Lead",
      };

      // Optimistically update local state immediately
      setCrmStore(prev => ({ ...prev, [id]: profile }));

      // Then write to Firestore (the snapshot listener will sync it properly)
      try {
      await setDoc(doc(db, "users", user.id, "crm_profiles", id), profile);
      } catch (error) {
        console.error('Error creating CRM profile:', error);
        // Revert optimistic update on error
        setCrmStore(prev => {
          const updated = { ...prev };
          delete updated[id];
          return updated;
        });
        throw error;
      }
    }
  };

  const addCRMNote = async (profileId: string, content: string) => {
    if (!user) return;

    const note: CRMNote = {
      id: String(Date.now()),
      content,
      timestamp: new Date().toISOString(),
      author: user.name,
    };

    await updateDoc(doc(db, "users", user.id, "crm_profiles", profileId), {
      notes: arrayUnion(note),
    });
  };

  const addCRMTag = async (profileId: string, tag: string) => {
    if (!user) return;

    await updateDoc(doc(db, "users", user.id, "crm_profiles", profileId), {
      tags: arrayUnion(tag),
    });
  };

  const removeCRMTag = async (profileId: string, tag: string) => {
    if (!user) return;

    await updateDoc(doc(db, "users", user.id, "crm_profiles", profileId), {
      tags: arrayRemove(tag),
    });
  };

  const updateCRMProfile = async (profileId: string, data: Partial<CRMProfile>) => {
    if (!user) return;

    await updateDoc(doc(db, "users", user.id, "crm_profiles", profileId), data);
  };

  /*--------------------------------------------------------------------
    AUTOPILOT
  --------------------------------------------------------------------*/
  const addAutopilotCampaign = async (
    data: Omit<
      AutopilotCampaign,
      "id" | "createdAt" | "progress" | "totalPosts" | "generatedPosts"
    >
  ): Promise<string> => {
    if (!user) throw new Error("User not found");

    const campaign: AutopilotCampaign = {
      id: `auto-${Date.now()}`,
      createdAt: new Date().toISOString(),
      progress: 0,
      totalPosts: 0,
      generatedPosts: 0,
      ...data,
    };

    await setDoc(
      doc(db, "users", user.id, "autopilot_campaigns", campaign.id),
      campaign
    );
    
    return campaign.id; // Return the campaign ID
  };

  const updateAutopilotCampaign = async (
    id: string,
    data: Partial<AutopilotCampaign>
  ) => {
    if (!user) return;

    await updateDoc(
      doc(db, "users", user.id, "autopilot_campaigns", id),
      data
    );
  };

  /*--------------------------------------------------------------------
    CONTEXT VALUE
  --------------------------------------------------------------------*/
  const value: DataContextType = {
    settings,
    setSettings,

    clients,
    setClients,
    teamMembers,
    setTeamMembers,
    selectedClient,
    setSelectedClient,

    notifications,
    setNotifications,

    messages,
    setMessages,
    updateMessage,
    deleteMessage,
    categorizeAllMessages,

    posts,
    setPosts,
    updatePost,
    deletePost,

    calendarEvents,
    setCalendarEvents,
    addCalendarEvent,

    crmStore,
    addCRMNote,
    addCRMTag,
    removeCRMTag,
    updateCRMProfile,
    ensureCRMProfile,

    userBaseImage,
    setUserBaseImage,

    userCustomVoices,
    setUserCustomVoices,

    composeState,
    setComposeState,

    hashtagSets,
    setHashtagSets,

    bioPage: bioPageConfig,
    setBioPage: setBioPageState as React.Dispatch<React.SetStateAction<BioPageConfig>>,
    saveBioPage,

    autopilotCampaigns,
    addAutopilotCampaign,
    updateAutopilotCampaign,

    socialAccounts,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
};
