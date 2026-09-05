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
  it("keeps an explicit page noIndex when the demo flag is false", () => {
    vi.stubEnv("VITE_DEMO_PREVIEW", "false");
    render(<><PreviewNotice /><Seo title="Información provisional" description="Pendiente de revisión" path="/devoluciones" noIndex /></>);
    expect(screen.queryByLabelText("Entorno de prueba")).toBeNull();
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex,nofollow");
  });
  it.each(["false", "TRUE", "1", ""])('does not treat "%s" as the explicit true flag', (value) => {
    vi.stubEnv("VITE_DEMO_PREVIEW", value);
    render(<PreviewNotice />);
    expect(screen.queryByLabelText("Entorno de prueba")).toBeNull();
  });
});
