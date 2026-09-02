import { render, screen } from "@testing-library/react";

/**
 * Test "smoke" per validare il setup Jest + React Testing Library.
 * Non testa una feature dell'app: verifica solo che il tooling
 * (jsdom, RTL, matchers jest-dom) funzioni correttamente.
 * Da rimuovere/sostituire quando i primi componenti reali arriveranno
 * da frontend.
 */
describe("QA tooling setup", () => {
  it("renders a basic component with React Testing Library", () => {
    render(<button>Ciao</button>);
    expect(screen.getByRole("button", { name: "Ciao" })).toBeInTheDocument();
  });
});
