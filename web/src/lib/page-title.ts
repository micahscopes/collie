import { useEffect } from "react";

// THE PAGE TITLE FOLLOWS WHAT YOU ARE LOOKING AT. The phone's app switcher and a desktop tab show
// it, and a fixed "Collie" said nothing about which pane a window was on.
//
// Two parts. The install's names come from lib/app-identity.ts (COLLIE_APP_NAME), and default to the
// title the shell was built with. The route's label comes from `usePageTitle` in the route that
// shows it: a pane's name, a space's name. With a label the title is "<label> · <short name>", so
// the part that differs from window to window comes first and survives truncation. With none it is
// the full name.

const builtTitle = ("document" in globalThis && document.title) || "Collie";
let fullName = builtTitle;
let shortName = builtTitle;
let label: string | null = null;

function render(): void {
  if (!("document" in globalThis)) return;
  document.title = label === null ? fullName : `${label} · ${shortName}`;
}

/** The install's own names, once `/api/config` has them. */
export function setTitleNames(name: string, short?: string): void {
  fullName = name;
  shortName = short ?? name;
  render();
}

/** Titles the page after `next` while the calling route is mounted. Empty or absent means no label. */
export function usePageTitle(next: string | null | undefined): void {
  const value = next?.trim() || null;
  useEffect(() => {
    label = value;
    render();
    return () => {
      label = null;
      render();
    };
  }, [value]);
}

/** Test seam: back to the built title with no label. */
export function __resetPageTitle(): void {
  fullName = builtTitle;
  shortName = builtTitle;
  label = null;
  render();
}
