import { create } from "zustand";
import { foldRun, type FoldedRun, type JournalEvent } from "@flowgate/schema";

function emptyFold(): FoldedRun {
  return { cancelling: false, steps: {}, branches: {}, lastSeq: 0, terminal: false };
}

type RunViewState = {
  runId: string | null;
  events: JournalEvent[];
  uptoSeq: number | null;
  folded: FoldedRun;
  setRun: (runId: string) => void;
  setHistory: (events: JournalEvent[]) => void;
  addEvent: (event: JournalEvent) => void;
  setUptoSeq: (seq: number | null) => void;
  reset: () => void;
};

export const useRunView = create<RunViewState>((set, get) => ({
  runId: null,
  events: [],
  uptoSeq: null,
  folded: emptyFold(),

  setRun: (runId) =>
    set({ runId, events: [], uptoSeq: null, folded: emptyFold() }),

  setHistory: (events) => {
    const sorted = [...events].sort((a, b) => a.seq - b.seq);
    set({
      events: sorted,
      folded: foldRun(sorted, get().uptoSeq ?? Number.POSITIVE_INFINITY),
    });
  },

  addEvent: (event) => {
    const state = get();
    if (state.events.some((candidate) => candidate.seq === event.seq)) return;
    const events = [...state.events, event].sort((a, b) => a.seq - b.seq);
    set({
      events,
      folded: foldRun(events, state.uptoSeq ?? Number.POSITIVE_INFINITY),
    });
  },

  setUptoSeq: (uptoSeq) =>
    set({
      uptoSeq,
      folded: foldRun(get().events, uptoSeq ?? Number.POSITIVE_INFINITY),
    }),

  reset: () => set({ runId: null, events: [], uptoSeq: null, folded: emptyFold() }),
}));
