#!/usr/bin/env bash
# Regenerate the seed fixture clips in public/fixtures/.
#
# You should not normally need to run this — the clips are committed, because the seed has
# to work on a fresh checkout without ffmpeg installed. It is here so the fixtures are
# reproducible rather than mysterious binaries, and so they can be regenerated if the
# voting surface ever needs different shapes to test against.
#
# The clips are generated, not downloaded: nothing here is anybody else's footage, so
# there is no licence to honour and no attribution to get wrong. They are portrait
# (mobile-first, like the product), silent, ~2 seconds, and a few kilobytes each.
#
# Requires ffmpeg. Run from the repo root: ./scripts/make-fixtures.sh

set -euo pipefail

OUT_DIR="public/fixtures"
COUNT=8

mkdir -p "$OUT_DIR"

# Distinct hues so a pair of entries is visually distinguishable at a glance while voting.
HUES=(0x1F3B57 0x7A2E39 0x2E5A3A 0x53406E 0x8A5A20 0x1E5A63 0x6B2D5C 0x37474F)

for i in $(seq 1 "$COUNT"); do
  hue="${HUES[$((i - 1))]}"
  out="$OUT_DIR/clip-$(printf '%02d' "$i").mp4"

  # Each clip is identified by a row of N pips rather than by text: this ffmpeg build has
  # no drawtext filter, and counting pips works without one.
  filter=""
  for j in $(seq 1 "$i"); do
    x=$((16 + (j - 1) * 30))
    filter+="drawbox=x=${x}:y=24:w=20:h=20:color=white:t=fill,"
  done
  # A bar sweeping down the frame, so it is obvious the clip is playing and not a poster.
  filter+="drawbox=x=0:y=(ih-8)*t/2:w=iw:h=8:color=white@0.9:t=fill"

  ffmpeg -y -loglevel error \
    -f lavfi -i "color=c=${hue}:s=270x480:d=2:r=12" \
    -vf "$filter" \
    -c:v libx264 -pix_fmt yuv420p -crf 34 -preset veryslow -movflags +faststart \
    -an "$out"

  echo "wrote $out ($(du -h "$out" | cut -f1))"
done
