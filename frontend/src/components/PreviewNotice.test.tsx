import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PreviewNotice } from "./PreviewNotice";
import { Seo } from "./Seo";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
describe("explicit presentation preview", () => {
  it("labels and noindexes only an explicit demo build", () => {
    vi.stubEnv("VITE_DEMO_PREVIEW", "true");
    render(<><PreviewNotice /><Seo title="Catálogo" description="Catálogo" path="/productos" /></>);
    expect(screen.getByLabelText("Entorno de prueba")).toBeTruthy();
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex,nofollow");
  });
  it("does not change normal production metadata or add a demo banner", () => {
    vi.stubEnv("VITE_DEMO_PREVIEW", "false");
    render(<><PreviewNotice /><Seo title="Catálogo" description="Catálogo" path="/productos" /></>);
    expect(screen.queryByLabelText("Entorno de prueba")).toBeNull();
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("index,follow");
  });
});
