import { mounted } from "@/lib/base-path";
import { setTitleNames } from "@/lib/page-title";
import type { AppIdentityWire } from "@/lib/types";

// This install's name and icons at RUNTIME (bridge/app-identity.ts holds the contract).
//
// The manifest carries the name and icons for Android, and the bridge serves it fresh. Three things
// live in the page itself instead, and the page is the precached shell, built with "Collie" in it:
// the tab title, iOS's home-screen title (`apple-mobile-web-app-title`, read when the operator taps
// Add to Home Screen) and the touch icon beside it. So they are set here, from `/api/config`, once
// per page load. A configuration change then reaches them on the next load without a rebuild.
//
// Nothing here runs when the bridge sends no `app` key, so an unnamed install keeps the shell as
// built.

/** The wire's URLs are relative to the app's mount; the page may be anywhere beneath it. */
function resolve(url: string): string {
  return mounted(`/${url.replace(/^\/+/, "")}`);
}

export function applyAppIdentity(app: AppIdentityWire | undefined, doc: Document = document): void {
  if (app === undefined) return;
  if (app.name !== undefined) {
    // The page title is lib/page-title.ts's, which puts the route's label in front of the name.
    setTitleNames(app.name, app.shortName);
    const title = doc.querySelector('meta[name="apple-mobile-web-app-title"]');
    // iOS shows at most about a dozen characters under the icon, which is the short name's job.
    title?.setAttribute("content", app.shortName ?? app.name);
  }
  if (app.appleTouchIcon !== undefined) {
    doc.querySelector('link[rel="apple-touch-icon"]')?.setAttribute("href", resolve(app.appleTouchIcon));
  }
  if (app.favicon !== undefined) {
    // The shell offers the shipped mark three ways (PNG, SVG, ICO) and a browser picks among them,
    // usually the SVG. One custom PNG has to be the only choice left, or it loses to the mark.
    const links = [...doc.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')];
    for (const link of links) link.remove();
    const icon = doc.createElement("link");
    icon.setAttribute("rel", "icon");
    icon.setAttribute("type", "image/png");
    icon.setAttribute("sizes", "96x96");
    icon.setAttribute("href", resolve(app.favicon));
    doc.head.append(icon);
  }
}
