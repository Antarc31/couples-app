/**
 * Unit test per components/ui/PasswordInput.tsx — richiesto dall'utente su
 * ogni campo password dell'app (login, signup, reset): un toggle
 * mostra/nascondi, non solo puntini.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PasswordInput from "@/components/ui/PasswordInput";

describe("PasswordInput", () => {
  it("di default il campo è type='password' (nascosto)", () => {
    render(<PasswordInput placeholder="Password" value="segreta" onChange={jest.fn()} />);
    expect(screen.getByPlaceholderText("Password")).toHaveAttribute("type", "password");
  });

  it("tap sul toggle mostra la password in chiaro (type='text'), un altro tap la nasconde di nuovo", async () => {
    const user = userEvent.setup();
    render(<PasswordInput placeholder="Password" value="segreta" onChange={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: "Mostra password" }));
    expect(screen.getByPlaceholderText("Password")).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Nascondi password" }));
    expect(screen.getByPlaceholderText("Password")).toHaveAttribute("type", "password");
  });

  it("inoltra le altre prop (required, minLength, autoComplete, onChange) al campo sottostante", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <PasswordInput
        placeholder="Password"
        value=""
        onChange={onChange}
        required
        minLength={6}
        autoComplete="new-password"
      />,
    );

    const input = screen.getByPlaceholderText("Password");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("minlength", "6");
    expect(input).toHaveAttribute("autocomplete", "new-password");

    await user.type(input, "a");
    expect(onChange).toHaveBeenCalled();
  });
});
