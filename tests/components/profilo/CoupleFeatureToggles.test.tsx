/**
 * Unit test per components/profilo/CoupleFeatureToggles.tsx —
 * lib/profile-actions.ts è mockato (vedi tests/lib/profile-actions.test.ts
 * per la copertura contro Supabase). Stesso pattern di next/navigation di
 * tests/components/profilo/ProfileEditForm.test.tsx.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRefresh = jest.fn<void, []>();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

type ActionError = { error: string };

const mockSetQuizEnabled = jest.fn<Promise<true | ActionError>, [boolean]>();
const mockSetMoodCheckinEnabled = jest.fn<Promise<true | ActionError>, [boolean]>();

jest.mock("@/lib/profile-actions", () => ({
  setQuizEnabled: (enabled: boolean) => mockSetQuizEnabled(enabled),
  setMoodCheckinEnabled: (enabled: boolean) => mockSetMoodCheckinEnabled(enabled),
}));

import CoupleFeatureToggles from "@/components/profilo/CoupleFeatureToggles";

beforeEach(() => {
  mockRefresh.mockReset();
  mockSetQuizEnabled.mockReset();
  mockSetMoodCheckinEnabled.mockReset();
});

describe("CoupleFeatureToggles", () => {
  it("mostra lo stato iniziale di entrambi i toggle", () => {
    render(<CoupleFeatureToggles quizEnabled={true} moodCheckinEnabled={false} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("Attivo");
    expect(buttons[1]).toHaveTextContent("Disattivato");
  });

  it("tap sul toggle quiz chiama setQuizEnabled con il valore invertito e fa router.refresh()", async () => {
    mockSetQuizEnabled.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<CoupleFeatureToggles quizEnabled={false} moodCheckinEnabled={false} />);

    await user.click(screen.getAllByRole("button")[0]);

    await waitFor(() => expect(mockSetQuizEnabled).toHaveBeenCalledWith(true));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("tap sul toggle check-in chiama setMoodCheckinEnabled con il valore invertito", async () => {
    mockSetMoodCheckinEnabled.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<CoupleFeatureToggles quizEnabled={false} moodCheckinEnabled={true} />);

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[1]);

    await waitFor(() => expect(mockSetMoodCheckinEnabled).toHaveBeenCalledWith(false));
  });

  it("mostra l'errore e non aggiorna lo stato visivo se la RPC fallisce", async () => {
    mockSetQuizEnabled.mockResolvedValue({ error: "Non sei accoppiato/a con un partner." });
    const user = userEvent.setup();
    render(<CoupleFeatureToggles quizEnabled={false} moodCheckinEnabled={false} />);

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);

    expect(await screen.findByText("Non sei accoppiato/a con un partner.")).toBeInTheDocument();
    expect(buttons[0]).toHaveTextContent("Disattivato");
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
