// THE INSTALLED APP'S IDENTITY, PER INSTALL: its name on the phone's launcher and its icon.
//
// Every install used to declare the same build-time manifest, so six installs on one phone were six
// tiles all reading "Collie" (upstream #219). Three settings fix that, read once at startup:
//
//   COLLIE_APP_NAME        the manifest `name`, the page title, and iOS's home-screen title
//   COLLIE_APP_SHORT_NAME  the manifest `short_name` (Android's launcher label). Defaults to the name
//   COLLIE_APP_ICON_DIR    a directory of ready-made PNGs, by the fixed file names in APP_ICON_FILES
//
// The PNGs are made ahead of time rather than drawn here because the bridge has no rasteriser, and
// Android's WebAPK wants real PNGs at 192 and 512. `packaging/nix/app-icons.nix` renders a set from
// an emoji and a colour; any other tool that writes the same file names works as well. A missing
// file falls back to the shipped icon for that slot, so a partial set is never a broken one.
//
// Unset, everything here is the identity function: the manifest is served as built, `/api/config`
// carries no `app` key, and no `/app-icons/` file exists.
//
// FRESHNESS. The manifest is kept out of the service worker's precache (vite.config.ts), so the
// bridge answers it on every fetch and a renamed install relabels itself when Chrome next checks.
// Each icon URL carries a hash of its bytes, so a redrawn icon is a new URL. The page title and the
// iOS touch icon live in the precached shell, so the app sets them at runtime from `/api/config`
// (web/src/lib/app-identity.ts) rather than relying on the shell's copy.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { JsonObject } from "./json.ts";
import type { AppIdentityWire } from "./types.ts";

/** The files an icon directory may hold, and what each one is. A closed list: a request names one
 *  of these or nothing is read. */
export const APP_ICON_FILES = {
  "icon-192.png": { sizes: "192x192", role: "manifest" },
  "icon-512.png": { sizes: "512x512", role: "manifest" },
  "apple-touch-icon.png": { sizes: "180x180", role: "apple-touch" },
  "favicon-96.png": { sizes: "96x96", role: "favicon" },
} as const;

export type AppIconFile = keyof typeof APP_ICON_FILES;

export function isAppIconFile(name: string): name is AppIconFile {
  return Object.hasOwn(APP_ICON_FILES, name);
}

/** One icon the directory supplied: its bytes, and the URL that names this exact drawing. */
export interface AppIcon {
  readonly bytes: Uint8Array;
  /** Relative to the app's mount, so it resolves under a base path the way the manifest's own
   *  relative srcs do (ADR 0052). */
  readonly url: string;
}

export interface AppIdentity {
  name?: string;
  shortName?: string;
  readonly icons: ReadonlyMap<AppIconFile, AppIcon>;
}


export const APP_ICON_ROUTE_PREFIX = "/app-icons/";

/**
 * Reads the settings and the icon directory. Files are read whole, once: they are a few kilobytes,
 * and a restart is how an install's configuration changes anyway. An unreadable file is skipped
 * with a warning, never fatal, since the shipped icon still fills its slot.
 */
export function loadAppIdentity(
  settings: { appName: string; appShortName: string; appIconDir: string },
  warn: (message: string) => void = (m) => console.warn(m),
  read: (path: string) => Uint8Array = (path) => readFileSync(path),
): AppIdentity {
  const name = settings.appName.trim();
  const shortName = settings.appShortName.trim() || name;
  const icons = new Map<AppIconFile, AppIcon>();
  const dir = settings.appIconDir.trim();
  if (dir !== "") {
    for (const file of Object.keys(APP_ICON_FILES)) {
      if (!isAppIconFile(file)) continue;
      let bytes: Uint8Array;
      try {
        bytes = read(join(dir, file));
      } catch {
        warn(`[app] ${join(dir, file)} is missing or unreadable; the shipped icon fills that slot`);
        continue;
      }
      if (!isPng(bytes)) {
        warn(`[app] ${join(dir, file)} is not a PNG; the shipped icon fills that slot`);
        continue;
      }
      const version = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
      icons.set(file, { bytes, url: `app-icons/${file}?v=${version}` });
    }
  }
  const identity: AppIdentity = { icons };
  if (name !== "") identity.name = name;
  if (shortName !== "") identity.shortName = shortName;
  return identity;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

export function hasAppIdentity(identity: AppIdentity): boolean {
  return identity.name !== undefined || identity.shortName !== undefined || identity.icons.size > 0;
}

/**
 * The built manifest with this install's identity laid over it. `name` and `short_name` replace the
 * build's when set. The two manifest icons replace the build's icon list only when BOTH sizes were
 * supplied: Android's install needs a 192 and a 512, and one custom size beside a shipped one would
 * be two different drawings of one app. Everything else in the manifest is left exactly as built.
 */
export function applyAppIdentity(manifest: JsonObject, identity: AppIdentity): JsonObject {
  const out: JsonObject = { ...manifest };
  if (identity.name !== undefined) out.name = identity.name;
  if (identity.shortName !== undefined) out.short_name = identity.shortName;
  const small = identity.icons.get("icon-192.png");
  const large = identity.icons.get("icon-512.png");
  if (small !== undefined && large !== undefined) {
    out.icons = [
      { src: small.url, sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: large.url, sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ];
  }
  return out;
}

/** The `/api/config` block, or undefined when nothing is configured (the key is then omitted). */
export function appIdentityWire(identity: AppIdentity): AppIdentityWire | undefined {
  if (!hasAppIdentity(identity)) return undefined;
  const wire: AppIdentityWire = {};
  if (identity.name !== undefined) wire.name = identity.name;
  if (identity.shortName !== undefined) wire.shortName = identity.shortName;
  const touch = identity.icons.get("apple-touch-icon.png");
  if (touch !== undefined) wire.appleTouchIcon = touch.url;
  const favicon = identity.icons.get("favicon-96.png");
  if (favicon !== undefined) wire.favicon = favicon.url;
  return wire;
}
