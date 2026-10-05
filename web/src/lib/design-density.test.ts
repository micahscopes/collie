import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { __resetDesign, designDensity, parseDesignPrefs, setDesignDensity, setDesignFont } from "./design";

afterEach(() => {
  localStorage.clear();
  __resetDesign();
});

describe("density", () => {
  it("is compact by default, and compact wears no class", () => {
    expect(designDensity()).toBe("compact");
    expect(document.documentElement.classList.contains("density-comfortable")).toBe(false);
  });

  it("comfortable puts the class on and persists", () => {
    setDesignDensity("comfortable");
    expect(document.documentElement.classList.contains("density-comfortable")).toBe(true);
    expect(parseDesignPrefs(localStorage.getItem("collie:design:v1")!).density).toBe("comfortable");
    setDesignDensity("compact");
    expect(document.documentElement.classList.contains("density-comfortable")).toBe(false);
  });

  it("a face change keeps the density", () => {
    setDesignDensity("comfortable");
    setDesignFont("grotesk");
    expect(designDensity()).toBe("comfortable");
  });

  it("reads only the closed literal", () => {
    expect(parseDesignPrefs('{"font":"aldrich","density":"comfortable"}').density).toBe("comfortable");
    expect(parseDesignPrefs('{"font":"aldrich","density":"huge"}').density).toBeUndefined();
    expect(parseDesignPrefs('{"font":"aldrich","density":1}').density).toBeUndefined();
  });

  it("the pre-paint script adds the same class for the same literal", () => {
    const src = readFileSync(join(import.meta.dirname, "..", "..", "public", "theme-init.js"), "utf8");
    expect(src).toContain('if (d.density === "comfortable") root.classList.add("density-comfortable");');
  });
});
