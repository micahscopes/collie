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
(`collie`, `collie-door`, `collie-stt`), so nothing in it changes.

## 5. Deploy

    nix flake update collie      # in eig
    git commit -am "collie: track fork"
    # deploy slab the usual way

The deploy restarts the three collie units, which drops the phone UI for a few seconds. Do it when
Micah says so.

### What to check after the deploy

- `collie version` reports `1.16.2`, with no `+suffix`.
- `journalctl --user -u collie` shows `listening on …`, and no error mentioning `pulse`.
- On the phone, while an agent is working, the network panel shows one long `GET /api/pulse`.
  Pane updates then land well under a second after the screen changes.
  - The pulse is off behind an Access gate (ADR 0081, addendum 2026-10-05).
  - Tune it with `COLLIE_PULSE_MS` (default 300).

## The update flow from here on

Edit and test here, commit on `main`, push to anchor, then in eig `nix flake update collie`, commit,
and deploy. To take upstream changes, merge `upstream/main` into `main` first. A conflict in
`flake.nix` is the `packages` block: keep this fork's.

When `bun.lock`, either `package.json` or the pinned Bun moves, the dependency hash moves too.
Redo step 2.
