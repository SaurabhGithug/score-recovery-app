"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface User {
  id: string;
  name: string;
  normalized_name: string;
  created_at: string;
  updated_at: string;
}

export type FixedProfile = "reema" | "saurabh";

export interface PreparationContext {
  id: string;
  user_id: string;
  name: string;
  type: "COMPETITIVE_EXAM" | "ACADEMIC" | "BOTH";
  exam_category: string | null;
  exam_id: string | null;
  exam_name: string | null;
  department: string | null;
  branch: string | null;
  degree: string | null;
  year: number | null;
  semester: number | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface UserContextValue {
  currentUser: User | null;
  isLoading: boolean;
  selectProfile: (profile: FixedProfile) => Promise<User>;
  logout: () => Promise<void>;
  openProfileModal: () => void;
  closeProfileModal: () => void;
  isProfileModalOpen: boolean;
  activeContext: PreparationContext | null;
  allContexts: PreparationContext[];
  switchContext: (contextId: string) => Promise<void>;
  createContext: (data: {
    name: string;
    type: "COMPETITIVE_EXAM" | "ACADEMIC" | "BOTH";
    examCategory?: string;
    examId?: string;
    examName?: string;
    department?: string;
    branch?: string;
    degree?: string;
    year?: number;
    semester?: number;
  }) => Promise<PreparationContext>;
  openOnboardingModal: () => void;
  closeOnboardingModal: () => void;
  isOnboardingModalOpen: boolean;
  refreshContexts: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [activeContext, setActiveContext] = useState<PreparationContext | null>(null);
  const [allContexts, setAllContexts] = useState<PreparationContext[]>([]);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);

  const saveActiveContextSession = useCallback((context: PreparationContext | null, userId: string) => {
    if (context) {
      window.localStorage.setItem(`src.active_context.v2.${userId}`, JSON.stringify(context));
    } else {
      window.localStorage.removeItem(`src.active_context.v2.${userId}`);
    }
  }, []);

  const fetchContexts = useCallback(async (user: User) => {
    try {
      const res = await fetch("/api/contexts", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const contexts = (data.contexts || []) as PreparationContext[];
      const active = (data.activeContext || null) as PreparationContext | null;
      setAllContexts(contexts);
      setActiveContext(active);
      saveActiveContextSession(active, user.id);
      // Preparation setup is opened explicitly from the menu, not over the learner's task.
    } catch {
      // The account remains signed in; the page can retry this non-critical request.
    }
  }, [saveActiveContextSession]);

  useEffect(() => {
    async function loadSession() {
      setIsLoading(true);
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const user = data.user as User;
          setCurrentUser(user);
          await fetchContexts(user);
        } else {
          setCurrentUser(null);
          setIsProfileModalOpen(false);
        }
      } finally {
        setIsLoading(false);
      }
    }
    void loadSession();
  }, [fetchContexts]);

  const finishAuthentication = async (user: User) => {
    setCurrentUser(user);
    setIsProfileModalOpen(false);
    await fetchContexts(user);
    window.dispatchEvent(new Event("user-profile-changed"));
    return user;
  };

  const selectProfile = async (profile: FixedProfile) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not open this profile.");
    return finishAuthentication(data.user as User);
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setCurrentUser(null);
    setActiveContext(null);
    setAllContexts([]);
    setIsOnboardingModalOpen(false);
    setIsProfileModalOpen(true);
    window.dispatchEvent(new Event("user-profile-changed"));
  };

  const switchContext = async (contextId: string) => {
    if (!currentUser) return;
    const res = await fetch(`/api/contexts/${contextId}/active`, { method: "POST" });
    if (!res.ok) return;
    const data = await res.json();
    setActiveContext(data.activeContext);
    saveActiveContextSession(data.activeContext, currentUser.id);
    await fetchContexts(currentUser);
    window.dispatchEvent(new Event("preparation-context-changed"));
  };

  const createContext = async (input: {
    name: string;
    type: "COMPETITIVE_EXAM" | "ACADEMIC" | "BOTH";
    examCategory?: string;
    examId?: string;
    examName?: string;
    department?: string;
    branch?: string;
    degree?: string;
    year?: number;
    semester?: number;
  }) => {
    if (!currentUser) throw new Error("Choose a profile first.");
    const res = await fetch("/api/contexts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create context");
    const created = data.context as PreparationContext;
    setActiveContext(created);
    saveActiveContextSession(created, currentUser.id);
    setIsOnboardingModalOpen(false);
    await fetchContexts(currentUser);
    window.dispatchEvent(new Event("preparation-context-changed"));
    return created;
  };

  return (
    <UserContext.Provider value={{
      currentUser,
      isLoading,
      selectProfile,
      logout,
      openProfileModal: () => setIsProfileModalOpen(true),
      closeProfileModal: () => setIsProfileModalOpen(false),
      isProfileModalOpen,
      activeContext,
      allContexts,
      switchContext,
      createContext,
      openOnboardingModal: () => setIsOnboardingModalOpen(true),
      closeOnboardingModal: () => setIsOnboardingModalOpen(false),
      isOnboardingModalOpen,
      refreshContexts: async () => { if (currentUser) await fetchContexts(currentUser); },
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used within a UserProvider");
  return context;
}
