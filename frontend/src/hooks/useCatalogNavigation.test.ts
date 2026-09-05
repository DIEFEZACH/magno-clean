import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNavigationCatalog } from "./useCatalogNavigation";

afterEach(()=>vi.unstubAllGlobals());
describe("navigation catalog",()=>{
  it("loads all pages rather than filtering the first page only",async()=>{
    const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({items:[{id:"family-1"}],pagination:{pages:2}})}).mockResolvedValueOnce({ok:true,json:async()=>({items:[{id:"family-2"}],pagination:{pages:2}})});
    vi.stubGlobal("fetch",fetch);
    expect(await fetchNavigationCatalog()).toEqual([{id:"family-1"},{id:"family-2"}]);
    expect(fetch).toHaveBeenCalledTimes(2);expect(fetch.mock.calls[1][0]).toContain("page=2&pageSize=48");
  });
  it("does not expose a partial navigation when a later page fails",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({items:[{id:"family-1"}],pagination:{pages:2}})}).mockResolvedValueOnce({ok:false}));
    await expect(fetchNavigationCatalog()).rejects.toThrow("No pudimos cargar");
  });
});
