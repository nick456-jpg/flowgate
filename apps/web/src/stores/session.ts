import { create } from "zustand";
import type { SessionUser } from "../lib/types";

type SessionStatus = "loading" | "authenticated" | "anonymous";

type SessionState = {
  status: SessionStatus;
  user: SessionUser | null;
  setUser: (user: SessionUser) => void;
  setAnonymous: () => void;
};

export const useSession = create<SessionState>((set) => ({
  status: "loading",
  user: null,
  setUser: (user) => set({ status: "authenticated", user }),
  setAnonymous: () => set({ status: "anonymous", user: null }),
}));
