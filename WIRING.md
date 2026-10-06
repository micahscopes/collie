# Wiring this fork into the fleet

This fork (`micahscopes/collie`) builds from source. `packages.<system>.collie` in `flake.nix` is
`packaging/nix/collie-src.nix`, not upstream's release-tarball wrapper (that is still there as
`collie-release`). The steps below follow the crush fork's precedent.

## 1. Mirror the fork on rhizomorph

1. Push this repo's `main` to GitHub (`micahscopes/collie`).
2. Create the bare mirror on rhizomorph, served as `git://anchor.ygg/collie.git`, the way crush's is.

## 2. The first build: fill in the dependency hash

Bun's install runs in a fixed-output derivation, so each system needs its hash in
`packaging/nix/deps-hashes.json`. `x86_64-linux` is filled in. It was computed in the wondering lab
with the pinned Bun 1.4.1 and came out the same on two fresh installs. The two others are
`lib.fakeHash` placeholders.

Run this on slab:

    nix build git+file:///path/to/collie#collie -L

If the x86_64 hash is wrong, Nix prints the right one. Copy it into `deps-hashes.json` and commit.
Then do the same on any aarch64 machine that runs collie.

The lab could not run this build itself: its proxy blocks cache.nixos.org. The steps were checked
by hand there with the pinned Bun: install, `vite build` and `bun build --compile`, offline and with
no git. `nix eval .#packages.x86_64-linux.collie.name` gives `collie-1.16.2`.

## 3. eig: the flake input

In eig's `flake.nix`, replace the upstream input:

```nix
# was: collie.url = "github:AltanS/collie/v1.16.2";
collie.url = "git://anchor.ygg/collie.git?ref=refs/heads/main";
```

Keep any `inputs.nixpkgs.follows` the old input had. The fork's flake pins its own nixpkgs revision
for Bun, and that pin is fine to keep.

## 4. eig: the overlay

Add an `eigOverlay` entry so the fork shadows `pkgs.collie` fleet-wide, as crush's does:

```nix
collie = inputs.collie.packages.${final.stdenv.hostPlatform.system}.collie;
```

`/greenhouse/seeds/services/collie/default.nix` already uses `pkgs.collie` for its three user units
(`collie` and `collie-stt`; the door is the system Caddy), so nothing in it changes.

## 5. Deploy

    nix flake update collie      # in eig
    git commit -am "collie: track fork"
    # deploy slab the usual way

Restarting collie (below) drops the phone UI for a few seconds. Do it when
Micah says so.

### What to check after the deploy

- `collie version` reports `1.16.2+nogit` (the Nix build has no git; upstream's build printed `+<sha>`).
- The deploy doesn't restart the user units: `systemctl --user restart collie collie-stt`.
- `journalctl --user -u collie` shows `listening on …`, and no error mentioning `pulse`.
- On the phone, while an agent is working, the network panel shows one long `GET /api/pulse`.
  Pane updates then land well under a second after the screen changes.
  - The pulse is off behind an Access gate (ADR 0081, addendum 2026-10-05).
  - Tune it with `COLLIE_PULSE_MS` (default 300).

## 6. Each install's name and icon on the phone

Every install used to show up on the phone as "Collie". Three settings name one install and give it
its own icon (`bridge/app-identity.ts`). All are optional, and unset means the shipped name and mark.

| Variable | What it sets | Default |
| --- | --- | --- |
| `COLLIE_APP_NAME` | The manifest `name`, the page title | Collie |
| `COLLIE_APP_SHORT_NAME` | The launcher label under the icon (Android `short_name`, iOS title) | the name |
| `COLLIE_APP_ICON_DIR` | A directory of ready-made PNGs, by these file names | the shipped mark |

The directory holds `icon-192.png` and `icon-512.png` (the manifest icons, used only as a pair),
`apple-touch-icon.png` (180, opaque) and `favicon-96.png`. A missing file keeps the shipped icon for
that slot. The bridge reads all three settings once at startup, so a change needs a restart.

The fork's flake renders the directory from an emoji and a colour, so eig can feed it the host's
shell-theme profile (`garden/shell-theme.nix`) directly. In the collie service, wherever the unit's
environment is set:

```nix
let
  theme = /* this host's or box's { colour, emoji } from garden/shell-theme.nix */;
  icons = inputs.collie.lib.appIcons {
    inherit pkgs;
    inherit (theme) emoji;
    colour = theme.colour;  # "#rgb" or "#rrggbb"; map an ANSI colour name to hex first
  };
in
{
  COLLIE_APP_NAME = "Collie · wondering-lab";
  COLLIE_APP_SHORT_NAME = "wondering";   # about 12 characters fit under an Android icon
  COLLIE_APP_ICON_DIR = "${icons}";
}
```

`lib.appIcons` draws the emoji from nixpkgs' Noto Color Emoji onto the colour, with Pillow. The
emoji sits inside the maskable safe zone, so Android's mask never cuts it. ZWJ sequences and flags
work, since nixpkgs' Pillow is built with libraqm.

What the phone does after the deploy:

- **Android:** Chrome re-reads the manifest and updates the installed app's label and icon on its own.
  This can take until the app has been opened a few times, or up to a day. Reinstalling is the
  quick way to see it.
- **iOS:** takes the name and icon when you tap Add to Home Screen. An existing tile keeps its old
  ones until it is removed and added again.
- **Service worker:** this build stops precaching the manifest, so the first load after the deploy
  replaces the old worker and every later read of the manifest reaches the bridge.

Check from the host:

    curl -s https://<host>/manifest.webmanifest | jq '.name, .short_name, .icons[].src'

## The update flow from here on

Edit and test here, commit on `main`, push to anchor, then in eig `nix flake update collie`, commit,
and deploy. To take upstream changes, merge `upstream/main` into `main` first. A conflict in
`flake.nix` is the `packages` block: keep this fork's.

When `bun.lock`, either `package.json` or the pinned Bun moves, the dependency hash moves too.
Redo step 2.
