/**
 * Unit test per components/ui/Toast.tsx — toast di conferma transiente,
 * primo (e unico finora) sistema di feedback nel progetto (verificato:
 * zero occorrenze di "toast" nel resto del repo prima di questo componente).
 */

import { act, render, screen } from "@testing-library/react";
import Toast from "@/components/ui/Toast";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Toast", () => {
  it("mostra il messaggio passato", () => {
    render(<Toast message="Evento salvato" onDismiss={jest.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Evento salvato");
  });

  it("chiama onDismiss automaticamente dopo durationMs", () => {
    const onDismiss = jest.fn();
    render(<Toast message="Evento salvato" durationMs={2500} onDismiss={onDismiss} />);

    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("variant='coppia' usa l'animazione con eco emotivo, variant di default no", () => {
    const { rerender } = render(<Toast message="Salvato" variant="coppia" onDismiss={jest.fn()} />);
    expect(screen.getByRole("status")).toHaveClass("animate-toast-pop");

    rerender(<Toast message="Salvato" variant="neutral" onDismiss={jest.fn()} />);
    expect(screen.getByRole("status")).toHaveClass("animate-toast-in");
    expect(screen.getByRole("status")).not.toHaveClass("animate-toast-pop");
  });
});
