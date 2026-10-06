import { describe, expect, test } from "bun:test";
import { applyAppIdentity, appIdentityWire, hasAppIdentity, isAppIconFile, loadAppIdentity } from "./app-identity.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const OTHER_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]);

const BUILT = {
  name: "Collie",
  short_name: "Collie",
  start_url: "./",
  icons: [{ src: "./web-app-manifest-192x192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" }],
};

/** A reader over an in-memory directory; anything absent throws, as readFileSync does. */
function dir(files: Record<string, Uint8Array>) {
  return (path: string): Uint8Array => {
    const name = path.split("/").at(-1)!;
    const bytes = files[name];
    if (bytes === undefined) throw new Error("ENOENT");
    return bytes;
  };
}

const quiet = () => {};

describe("loadAppIdentity", () => {
  test("nothing set is no identity, and the manifest goes out as built", () => {
    const id = loadAppIdentity({ appName: "", appShortName: "", appIconDir: "" }, quiet);
    expect(hasAppIdentity(id)).toBe(false);
    expect(applyAppIdentity(BUILT, id)).toEqual(BUILT);
    expect(appIdentityWire(id)).toBeUndefined();
  });

  test("the short name defaults to the name", () => {
    const id = loadAppIdentity({ appName: "Collie · slab", appShortName: "", appIconDir: "" }, quiet);
    expect(id.name).toBe("Collie · slab");
    expect(id.shortName).toBe("Collie · slab");
  });

  test("reads the closed list of files, skips what is missing or not a PNG, and versions each URL", () => {
    const warnings: string[] = [];
    const id = loadAppIdentity(
      { appName: "", appShortName: "", appIconDir: "/icons" },
      (m) => warnings.push(m),
      dir({ "icon-192.png": PNG, "icon-512.png": PNG, "favicon-96.png": new Uint8Array([1, 2, 3]) }),
    );
    expect([...id.icons.keys()].toSorted()).toEqual(["icon-192.png", "icon-512.png"]);
    expect(id.icons.get("icon-192.png")!.url).toMatch(/^app-icons\/icon-192\.png\?v=[0-9a-f]{12}$/);
    expect(warnings.some((w) => w.includes("apple-touch-icon.png") && w.includes("missing"))).toBe(true);
    expect(warnings.some((w) => w.includes("favicon-96.png") && w.includes("not a PNG"))).toBe(true);
  });

  test("a redrawn icon is a new URL", () => {
    const read = (bytes: Uint8Array) =>
      loadAppIdentity({ appName: "", appShortName: "", appIconDir: "/i" }, quiet, dir({ "icon-192.png": bytes }));
    expect(read(PNG).icons.get("icon-192.png")!.url).not.toBe(read(OTHER_PNG).icons.get("icon-192.png")!.url);
  });
});

describe("applyAppIdentity", () => {
  test("names and both sizes replace the build's, and nothing else moves", () => {
    const id = loadAppIdentity(
      { appName: "Collie · slab", appShortName: "slab", appIconDir: "/i" },
      quiet,
      dir({ "icon-192.png": PNG, "icon-512.png": PNG }),
    );
    const out = applyAppIdentity(BUILT, id);
    expect(out.name).toBe("Collie · slab");
    expect(out.short_name).toBe("slab");
    expect(out.start_url).toBe("./");
    expect(out.icons).toEqual([
      { src: id.icons.get("icon-192.png")!.url, sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: id.icons.get("icon-512.png")!.url, sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ]);
  });

  test("one manifest size alone leaves the shipped icons in place", () => {
    const id = loadAppIdentity({ appName: "", appShortName: "", appIconDir: "/i" }, quiet, dir({ "icon-512.png": PNG }));
    expect(applyAppIdentity(BUILT, id).icons).toEqual(BUILT.icons);
  });
});

describe("appIdentityWire", () => {
  test("carries the names and the two icons a page sets itself", () => {
    const id = loadAppIdentity(
      { appName: "Collie · slab", appShortName: "slab", appIconDir: "/i" },
      quiet,
      dir({ "apple-touch-icon.png": PNG, "favicon-96.png": PNG }),
    );
    const wire = appIdentityWire(id)!;
    expect(wire.name).toBe("Collie · slab");
    expect(wire.shortName).toBe("slab");
    expect(wire.appleTouchIcon).toMatch(/^app-icons\/apple-touch-icon\.png\?v=/);
    expect(wire.favicon).toMatch(/^app-icons\/favicon-96\.png\?v=/);
  });
});

describe("isAppIconFile", () => {
  test("is the closed list and nothing else", () => {
    expect(isAppIconFile("icon-192.png")).toBe(true);
    expect(isAppIconFile("../secret")).toBe(false);
    expect(isAppIconFile("toString")).toBe(false);
    expect(isAppIconFile("icon-192.png/..")).toBe(false);
  });
});
