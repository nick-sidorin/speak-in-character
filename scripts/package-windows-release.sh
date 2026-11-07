#!/usr/bin/env bash
set -euo pipefail

exe="$(find "$GITHUB_WORKSPACE/staging" -type f -name SpeakInCharacter.exe -print -quit)"
if [[ -z "$exe" ]]; then
  echo "No SpeakInCharacter.exe found in the selected build artifact" >&2
  exit 1
fi

directory="$(dirname "$exe")"
archive="SpeakInCharacter-${VERSION}-Windows-x64-portable.zip"
(cd "$directory" && zip -q -r "$GITHUB_WORKSPACE/$archive" .)
unzip -tqq "$GITHUB_WORKSPACE/$archive"
(cd "$GITHUB_WORKSPACE" && sha256sum "$archive" > SHA256SUMS.txt)
echo "archive=$archive" >> "$GITHUB_OUTPUT"
echo "Packed $archive"
