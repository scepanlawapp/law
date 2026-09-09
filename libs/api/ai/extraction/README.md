# extraction

Attachment text extraction (PDF, DOCX, XLS/XLSX, TXT, image OCR). All returned text is normalized to Serbian Latin via `@law/transliteration`; the detected source script is reported separately.

Scanned/image-only PDFs: when the text layer has fewer than `PDF_OCR_MIN_TEXT_CHARS` (default 50) characters, up to `PDF_OCR_MAX_PAGES` (default 20) pages are rasterized and OCR'd with the local Tesseract worker (`eng`, `srp`, `srp_latn`).

## Building

Run `nx build extraction` to build the library.

## Running unit tests

Run `nx test extraction` to execute the unit tests via [Jest](https://jestjs.io).

The real-OCR integration test is opt-in (needs `./tessdata` and ESM dynamic import in Jest's VM):

```sh
RUN_OCR_INTEGRATION=1 NODE_OPTIONS=--experimental-vm-modules npx jest --config libs/api/ai/extraction/jest.config.cts pdf-ocr-fallback
```
