import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminLogin } from "./AdminLogin";

const mocks = vi.hoisted(() => ({ state: {
  login: vi.fn(), logout: vi.fn(), logoutUnconfirmed: false, lastError: null as string | null,
} }));
vi.mock("../store/authStore", () => ({
  useAuthStore: Object.assign((selector: (state: typeof mocks.state) => unknown) => selector(mocks.state), { getState: () => mocks.state }),
}));
vi.mock("../components/admin/AdminFeedback", () => ({ useAdminFeedback: () => ({ toast: vi.fn() }) }));

describe("Admin login revocation warning", () => {
  beforeEach(() => { mocks.state.logoutUnconfirmed = false; mocks.state.lastError = null; mocks.state.login.mockReset(); mocks.state.logout.mockReset(); });
  it("renders a persistent warning after navigation, allows explicit retry and blocks a new login until confirmed", async () => {
    mocks.state.logoutUnconfirmed = true;
    mocks.state.logout.mockImplementation(async () => { mocks.state.logoutUnconfirmed = false; });
    render(<MemoryRouter initialEntries={["/admin/login"]}><AdminLogin/></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("servidor no confirmó la revocación");
    expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reintentar cierre de sesión" }));
    expect(mocks.state.logout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
    expect(mocks.state.login).not.toHaveBeenCalled();
  });
  it("keeps the warning and retry available if the server still does not confirm", async () => {
    mocks.state.logoutUnconfirmed = true;
    mocks.state.logout.mockResolvedValue(undefined);
    render(<MemoryRouter><AdminLogin/></MemoryRouter>);
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar cierre de sesión" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar cierre de sesión" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
  });
});
