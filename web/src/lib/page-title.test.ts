import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { __resetPageTitle, setTitleNames, usePageTitle } from "./page-title";

afterEach(() => __resetPageTitle());

describe("page title", () => {
  it("puts the route's label in front of the install's short name", () => {
    setTitleNames("Collie · slab", "slab");
    const { unmount } = renderHook(() => usePageTitle("voice agent"));
    expect(document.title).toBe("voice agent · slab");
    unmount();
    expect(document.title).toBe("Collie · slab");
  });

  it("follows the label as it changes", () => {
    const { rerender } = renderHook(({ label }) => usePageTitle(label), { initialProps: { label: "one" } });
    expect(document.title.startsWith("one · ")).toBe(true);
    rerender({ label: "two" });
    expect(document.title.startsWith("two · ")).toBe(true);
  });

  it("an empty label is no label", () => {
    setTitleNames("Collie · slab", "slab");
    renderHook(() => usePageTitle("   "));
    expect(document.title).toBe("Collie · slab");
  });

  it("names arriving after the label still compose", () => {
    renderHook(() => usePageTitle("pane"));
    setTitleNames("Collie · calc", "calc");
    expect(document.title).toBe("pane · calc");
  });
});
