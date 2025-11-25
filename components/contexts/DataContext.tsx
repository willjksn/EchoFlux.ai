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
  ) => Promise<void>;
  updateAutopilotCampaign: (campaignId: string, data: Partial<AutopilotCampaign>) => Promise<void>;
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

  const [crmStore, setCrmStore] = useState<Record<string, CRMProfile>>({});
  const [userCustomVoices, setUserCustomVoices] = useState<CustomVoice[]>([]);
  const [autopilotCampaigns, setAutopilotCampaigns] = useState<AutopilotCampaign[]>([]);

  const [userBaseImage, setUserBaseImage] =
    useState<{ data: string; mimeType: string } | null>(null);

  const [composeState, setComposeState] = useState<ComposeState>({
    media: null,
    results: [],
    captionText: "",
    postGoal: "engagement",
    postTone: "friendly",
  });

  const [hashtagSets, setHashtagSets] = useState<HashtagSet[]>([]);
  const [bioPage, setBioPageState] = useState<BioPageConfig | null>(null);

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
    if (!user) {
      setMessages([]);
      setPosts([]);
      setCalendarEvents([]);
      setCrmStore({});
      setUserCustomVoices([]);
      setAutopilotCampaigns([]);
      return;
    }

    const subcollections = [
      { name: "messages", setter: setMessages, seed: MOCK_MESSAGES, seedIdField: "id" },
      { name: "posts", setter: setPosts, seed: MOCK_POSTS, seedIdField: "id" },
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
    ];

    const unsubscribers = subcollections.map(({ name, setter, seed, seedIdField }) => {
      const collRef = collection(db, "users", user.id, name);
      const q = query(collRef, orderBy("timestamp", "desc"));

      return onSnapshot(
        q,
        async (snapshot) => {
          if (snapshot.empty && seed && seedIdField) {
            for (const item of seed) {
              const idValue = extractId(item, seedIdField);
              await setDoc(doc(collRef, idValue), item as any);
            }
          } else {
            const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            setter(items as any);
          }
        },
        (err) => {
          if (err.code !== "permission-denied") console.error(err);
        }
      );
    });

    if (user.bioPage) setBioPageState(user.bioPage);

    return () => unsubscribers.forEach((u) => u());
  }, [user?.id]);

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
    if (bioPage) return bioPage;

    const defaultEmail: EmailCaptureConfig = {
      enabled: false,
      title: "Join my list",
      placeholder: "Enter your email",
      buttonText: "Submit",
      successMessage: "Thank you for subscribing!",
    };

    return {
      username: user?.name?.replace(/\s+/g, "").toLowerCase() || "user",
      displayName: user?.name || "My Name",
      avatar: user?.avatar || "",
      bio: "Welcome!",
      theme: {
        backgroundColor: "#ffffff",
        buttonColor: "#000000",
        textColor: "#000000",
        buttonStyle: "rounded",
      },
      links: [],
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
          if (category && category !== msg.category) {
            await updateMessage(msg.id, { category });
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

    await deleteDoc(doc(db, "users", user.id, "posts", postId))
      .then(() => showToast("Post deleted", "success"))
      .catch(() => showToast("Failed to delete post", "error"));
  };

  /*--------------------------------------------------------------------
    CALENDAR
  --------------------------------------------------------------------*/
  const addCalendarEvent = async (event: CalendarEvent) => {
    if (!user) return;

    await setDoc(doc(db, "users", user.id, "calendar_events", event.id), {
      ...event,
    }).catch(() => showToast("Failed to save event", "error"));
  };

  /*--------------------------------------------------------------------
    BIO PAGE SAVE
  --------------------------------------------------------------------*/
  const saveBioPage = async (config: BioPageConfig) => {
    if (!user) return;

    await updateDoc(doc(db, "users", user.id), { bioPage: config });

    setBioPageState(config);
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

      await setDoc(doc(db, "users", user.id, "crm_profiles", id), profile);
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
  ) => {
    if (!user) return;

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
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
};
