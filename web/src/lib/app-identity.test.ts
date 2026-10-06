import { beforeEach, describe, expect, it } from "vitest";

import { applyAppIdentity } from "./app-identity";

// The shell's own head, as index.html builds it.
function shell(): Document {
  const doc = document.implementation.createHTMLDocument("Collie");
  doc.head.innerHTML = `
    <title>Collie</title>
    <meta name="apple-mobile-web-app-title" content="Collie" />
    <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="shortcut icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />`;
  return doc;
}

describe("applyAppIdentity", () => {
  let doc: Document;
  beforeEach(() => {
    doc = shell();
  });

  it("leaves the shell alone when the bridge names nothing", () => {
    applyAppIdentity(undefined, doc);
    expect(doc.title).toBe("Collie");
    expect(doc.querySelectorAll('link[rel="icon"]')).toHaveLength(2);
  });

  it("sets the title, and iOS's home-screen title to the short name", () => {
    applyAppIdentity({ name: "Collie · slab", shortName: "slab" }, doc);
    expect(doc.title).toBe("Collie · slab");
    expect(doc.querySelector('meta[name="apple-mobile-web-app-title"]')!.getAttribute("content")).toBe("slab");
  });

  it("points the touch icon at the install's own, resolved from the root", () => {
    applyAppIdentity({ appleTouchIcon: "app-icons/apple-touch-icon.png?v=abc" }, doc);
    expect(doc.querySelector('link[rel="apple-touch-icon"]')!.getAttribute("href")).toBe(
      "/app-icons/apple-touch-icon.png?v=abc",
    );
  });

  it("makes the install's favicon the only icon a browser can pick", () => {
    applyAppIdentity({ favicon: "app-icons/favicon-96.png?v=abc" }, doc);
    const icons = [...doc.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')];
    expect(icons.map((l) => l.getAttribute("href"))).toEqual(["/app-icons/favicon-96.png?v=abc"]);
  });
});
