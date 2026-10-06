# One install's icon set, rendered at build time from an emoji and a colour: the directory
# COLLIE_APP_ICON_DIR points at (bridge/app-identity.ts). The drawing is app-icons.py; this is the
# toolchain around it. nixpkgs' Pillow is built with libraqm, so ZWJ sequences and flags render as
# one glyph.
#
#   collie.lib.appIcons { inherit pkgs; emoji = "🪨"; colour = "#5b6470"; }
{
  lib,
  runCommand,
  python3,
  noto-fonts-color-emoji,
  emoji,
  colour,
}:

runCommand "collie-app-icons"
  {
    nativeBuildInputs = [ (python3.withPackages (ps: [ ps.pillow ])) ];
  }
  ''
    python3 ${./app-icons.py} \
      --emoji ${lib.escapeShellArg emoji} \
      --colour ${lib.escapeShellArg colour} \
      --font ${noto-fonts-color-emoji}/share/fonts/noto/NotoColorEmoji.ttf \
      --out "$out"
  ''
