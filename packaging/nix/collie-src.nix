# Collie built from THIS source tree, for a fork that ships commits upstream has not released.
#
# The sibling `collie.nix` wraps an upstream release tarball and cannot carry a local change. This
# derivation runs the same steps as the release workflow's payload job (.github/workflows/release.yml,
# "Build the payload"), inside Nix:
#
#   1. `deps` installs both dependency trees (root and web/) with the pinned Bun. That needs the
#      network, so it is a FIXED-OUTPUT derivation: its output is checked against a hash, which is
#      what lets it fetch. `--frozen-lockfile` holds it to bun.lock and `--ignore-scripts` keeps any
#      package's install script out of it (none of the build needs one; measured 2026-10-05). The
#      native packages (oxlint, esbuild, rollup, lightningcss, tailwind's oxide) are per platform,
#      so the hash is too: `depsHashes` below, one per system.
#   2. The build copies those trees in, builds web/dist with Vite and compiles bin/collie with
#      `bun build --compile`, offline.
#   3. It lays the result out as the release tarball's root under $out/lib/collie, with
#      $out/bin/collie a symlink into it, for the reason collie.nix gives: bridge/root.ts resolves
#      the install root through that symlink and accepts it only where herdr-plugin.toml sits.
#
# The compile copies the RUNNING bun as the base of the binary. Upstream's release must not do that
# with nixpkgs' bun (#184), because its patched interpreter points into the build machine's store.
# Here that store path is exactly what a Nix package may depend on, so it is fine, and Nix records
# it as a runtime dependency. For the same reason nothing below patches or strips the binary: the
# bundle is appended to the ELF image, and rewriting the file can leave one that no longer starts.
#
# UPDATING THE HASH. When bun.lock, either package.json or the pinned Bun changes, set the system's
# entry in `depsHashes` to `lib.fakeHash`, build, and copy the hash Nix reports.
{
  lib,
  stdenvNoCC,
  bun,
  src,
  version,
  depsHashes ? lib.importJSON ./deps-hashes.json,
}:

let
  system = stdenvNoCC.hostPlatform.system;

  deps = stdenvNoCC.mkDerivation {
    pname = "collie-deps";
    inherit version src;

    nativeBuildInputs = [ bun ];
    dontConfigure = true;
    dontFixup = true;

    buildPhase = ''
      runHook preBuild
      export HOME="$TMPDIR/home"
      export BUN_INSTALL_CACHE_DIR="$TMPDIR/bun-cache"
      bun install --frozen-lockfile --ignore-scripts --no-progress
      (cd web && bun install --frozen-lockfile --ignore-scripts --no-progress)
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      mkdir -p "$out/web"
      cp -R node_modules "$out/node_modules"
      cp -R web/node_modules "$out/web/node_modules"
      runHook postInstall
    '';

    outputHashMode = "recursive";
    outputHashAlgo = "sha256";
    outputHash =
      depsHashes.${system}
        or (throw "collie: no dependency hash for ${system}; add one to packaging/nix/deps-hashes.json");
  };
in
stdenvNoCC.mkDerivation {
  pname = "collie";
  inherit version src;

  nativeBuildInputs = [ bun ];

  dontConfigure = true;
  dontStrip = true;
  dontPatchELF = true;

  buildPhase = ''
    runHook preBuild
    export HOME="$TMPDIR/home"

    cp -R ${deps}/node_modules node_modules
    cp -R ${deps}/web/node_modules web/node_modules
    chmod -R u+w node_modules web/node_modules
    # The packages' bins start `#!/usr/bin/env node`, and the sandbox has neither /usr/bin/env nor
    # node. A `node` that is the pinned Bun (the runtime the release runs them under) lets
    # patchShebangs rewrite them to something that exists.
    mkdir -p "$TMPDIR/bin"
    ln -s ${bun}/bin/bun "$TMPDIR/bin/node"
    export PATH="$TMPDIR/bin:$PATH"
    patchShebangs node_modules web/node_modules

    # The version gate `collie build` and the release both run: the four version files must agree.
    bash scripts/check-version.sh

    (cd web && bun run build)

    mkdir -p "$TMPDIR/stage/bin"
    bun run scripts/build-cli.ts --outfile "$TMPDIR/stage/bin/collie"
    runHook postBuild
  '';

  # The release payload's file list, kept in its order (release.yml, "Build the payload").
  installPhase = ''
    runHook preInstall
    root="$out/lib/collie"
    mkdir -p "$root/bin" "$root/web" "$root/scripts" "$out/bin"
    cp "$TMPDIR/stage/bin/collie" "$root/bin/collie"
    chmod 0755 "$root/bin/collie"
    cp -R web/dist "$root/web/dist"
    cp herdr-plugin.toml package.json .env.example CHANGELOG.md LICENSE README.md "$root/"
    cp -R docs "$root/docs"
    cp scripts/collie-ctl.sh "$root/scripts/collie-ctl.sh"
    chmod 0755 "$root/scripts/collie-ctl.sh"
    ln -s "$root/bin/collie" "$out/bin/collie"
    runHook postInstall
  '';

  # The checks the release runs on the binary an operator gets: it reports this version, and it
  # carries the embedded operator docs, which nothing on disk supplied.
  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    reported="$("$out/bin/collie" version)"
    case "$reported" in
      "${version}"*) echo "collie version says: $reported" ;;
      *) echo "the binary reports '$reported', not ${version}" >&2; exit 1 ;;
    esac
    [ "$("$out/bin/collie" docs crew | head -1)" = "# Crew commands" ]
    runHook postInstallCheck
  '';

  passthru = { inherit deps; };

  meta = {
    description = "Phone web UI for the AI agents running in your terminal, built from source";
    homepage = "https://github.com/micahscopes/collie";
    license = lib.licenses.mit;
    mainProgram = "collie";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "aarch64-darwin"
    ];
    sourceProvenance = [ lib.sourceTypes.fromSource ];
  };
}
