/**
 * Unit test per components/MoodRevealSheet.tsx — dettaglio aperto dal tap
 * su una notifica "check-in svelato" (components/AppTopBar.tsx).
 * lib/mood-actions.ts è mockato (vedi tests/lib/mood-actions.test.ts per
 * la copertura contro Supabase).
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MoodReveal } from "@/lib/mood-actions";

type ActionError = { error: string };

const mockGetMoodRevealForNotification = jest.fn<Promise<MoodReveal | ActionError>, [string]>();

jest.mock("@/lib/mood-actions", () => ({
  getMoodRevealForNotification: (sourceId: string) => mockGetMoodRevealForNotification(sourceId),
}));

import MoodRevealSheet from "@/components/MoodRevealSheet";

beforeEach(() => {
  mockGetMoodRevealForNotification.mockReset();
});

describe("MoodRevealSheet", () => {
  it("chiama onNotReady (non onClose) se la RPC ritorna not_ready", async () => {
    mockGetMoodRevealForNotification.mockResolvedValue({ error: "not_ready" });
    const onNotReady = jest.fn();
    const onClose = jest.fn();
    render(<MoodRevealSheet sourceId="row-1" onClose={onClose} onNotReady={onNotReady} />);

    await waitFor(() => expect(onNotReady).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("mostra un errore generico se la query fallisce per un motivo diverso da not_ready", async () => {
    mockGetMoodRevealForNotification.mockResolvedValue({ error: "Errore di rete" });
    const onNotReady = jest.fn();
    render(<MoodRevealSheet sourceId="row-1" onClose={jest.fn()} onNotReady={onNotReady} />);

    expect(await screen.findByText("Errore di rete")).toBeInTheDocument();
    expect(onNotReady).not.toHaveBeenCalled();
  });

  it("mostra entrambi i mood con i nomi corretti quando risolto", async () => {
    mockGetMoodRevealForNotification.mockResolvedValue({
      myMood: "felice",
      myCustomLabel: null,
      partnerMood: "stanco",
      partnerCustomLabel: null,
      partnerName: "Sam",
      revealed: true,
      checkinDate: "2026-08-20",
    });
    render(<MoodRevealSheet sourceId="row-1" onClose={jest.fn()} onNotReady={jest.fn()} />);

    expect(await screen.findByText("😊")).toBeInTheDocument();
    expect(screen.getByText("😴")).toBeInTheDocument();
    expect(screen.getByText("Sam")).toBeInTheDocument();
    expect(screen.getByText("Tu")).toBeInTheDocument();
  });

  it("mostra l'etichetta personalizzata quando il mood è 'altro'", async () => {
    mockGetMoodRevealForNotification.mockResolvedValue({
      myMood: "altro",
      myCustomLabel: "Nervoso per l'esame",
      partnerMood: "felice",
      partnerCustomLabel: null,
      partnerName: "Sam",
      revealed: true,
      checkinDate: "2026-08-20",
    });
    render(<MoodRevealSheet sourceId="row-1" onClose={jest.fn()} onNotReady={jest.fn()} />);

    expect(await screen.findByText("Nervoso per l'esame")).toBeInTheDocument();
  });

  it("tap sulla ✕ chiama onClose", async () => {
    mockGetMoodRevealForNotification.mockResolvedValue({
      myMood: "felice",
      myCustomLabel: null,
      partnerMood: "stanco",
      partnerCustomLabel: null,
      partnerName: "Sam",
      revealed: true,
      checkinDate: "2026-08-20",
    });
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(<MoodRevealSheet sourceId="row-1" onClose={onClose} onNotReady={jest.fn()} />);

    await user.click(await screen.findByLabelText("Chiudi"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
