/**
 * Unit test per components/home/ThrowbackCard.tsx — "Un anno fa oggi"
 * (Fase C del piano). lib/messages-actions.ts è mockato (vedi
 * tests/lib/messages-actions.test.ts per la copertura di
 * getThrowbackForToday contro Supabase): qui solo l'orchestrazione UI —
 * nessun output quando non c'è nulla, rendering di pensieri/foto/regali,
 * apertura dell'overlay al tap su una foto.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Thought } from "@/lib/messages-actions";

type ActionError = { error: string };

const mockGetThrowbackForToday =
  jest.fn<Promise<{ thoughts: Thought[]; giftTitles: string[] } | ActionError>, []>();

jest.mock("@/lib/messages-actions", () => ({
  getThrowbackForToday: () => mockGetThrowbackForToday(),
}));

import ThrowbackCard from "@/components/home/ThrowbackCard";

const textThought: Thought = {
  id: "t1",
  senderId: "partner-1",
  senderName: "Sam",
  type: "text",
  content: "Un anno fa qui",
  photoUrl: null,
  createdAt: "2025-09-02T08:00:00.000Z",
  likedByMe: false,
};

const photoThought: Thought = {
  id: "p1",
  senderId: "me",
  senderName: "Tu",
  type: "photo",
  content: "📷",
  photoUrl: "https://signed.example/p1.jpg",
  createdAt: "2025-09-02T09:00:00.000Z",
  likedByMe: false,
};

beforeEach(() => {
  mockGetThrowbackForToday.mockReset();
});

describe("ThrowbackCard", () => {
  it("non renderizza nulla se non c'è contenuto", async () => {
    mockGetThrowbackForToday.mockResolvedValue({ thoughts: [], giftTitles: [] });
    const { container } = render(<ThrowbackCard selfId="me" />);

    await waitFor(() => expect(mockGetThrowbackForToday).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("non renderizza nulla se la chiamata fallisce", async () => {
    mockGetThrowbackForToday.mockResolvedValue({ error: "Errore di rete" });
    const { container } = render(<ThrowbackCard selfId="me" />);

    await waitFor(() => expect(mockGetThrowbackForToday).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra pensieri e regali quando presenti", async () => {
    mockGetThrowbackForToday.mockResolvedValue({
      thoughts: [textThought],
      giftTitles: ["Un anello"],
    });
    render(<ThrowbackCard selfId="me" />);

    expect(await screen.findByText("Un anno fa oggi", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Un anno fa qui")).toBeInTheDocument();
    expect(screen.getByText("Sam")).toBeInTheDocument();
    expect(screen.getByText("Un anello", { exact: false })).toBeInTheDocument();
  });

  it("tap su una card foto apre l'overlay fullscreen, tap fuori lo chiude", async () => {
    mockGetThrowbackForToday.mockResolvedValue({ thoughts: [photoThought], giftTitles: [] });
    const user = userEvent.setup();
    render(<ThrowbackCard selfId="me" />);

    await screen.findByText("Un anno fa oggi", { exact: false });
    // Le anteprime foto non hanno alt text (decorative), non hanno ruolo "img"
    // accessibile: si clicca il bottone della card, non l'<img> al suo interno.
    await user.click(screen.getAllByRole("button")[0]);

    expect(await screen.findByText("Tu · un anno fa")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Chiudi"));
    expect(screen.queryByText("Tu · un anno fa")).not.toBeInTheDocument();
  });
});
