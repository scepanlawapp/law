#!/usr/bin/env bash
# Downloads Tesseract OCR language data used by attachment text extraction.
# Run once during environment setup; files are cached locally so OCR never
# calls out to a CDN at runtime (on-premise / zero-leakage requirement).
set -euo pipefail

TARGET_DIR="${TESSDATA_DIR:-./tessdata}"
LANGUAGES=(eng srp srp_latn)
BASE_URL="https://github.com/tesseract-ocr/tessdata_fast/raw/main"

mkdir -p "$TARGET_DIR"

for lang in "${LANGUAGES[@]}"; do
  dest="$TARGET_DIR/$lang.traineddata"
  if [[ -f "$dest" ]]; then
    echo "Skipping $lang, already present at $dest"
    continue
  fi
  echo "Downloading $lang.traineddata..."
  curl -fsSL "$BASE_URL/$lang.traineddata" -o "$dest"
done

echo "Tesseract language data ready in $TARGET_DIR"
