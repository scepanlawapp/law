import { createWorker, type Worker } from "tesseract.js";

const OCR_LANGUAGES = ["eng", "srp", "srp_latn"];

let workerPromise: Promise<Worker> | null = null;

// Local traineddata dir, never a CDN, to keep OCR fully on-premise.
function resolveLangPath(): string {
  return process.env["TESSDATA_DIR"] ?? "./tessdata";
}

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    const langPath = resolveLangPath();
    workerPromise = createWorker(OCR_LANGUAGES, undefined, {
      langPath,
      cachePath: langPath,
      gzip: false,
    });
  }
  return workerPromise;
}

export async function extractImageText(buffer: Buffer): Promise<string> {
  const worker = await getWorker();
  const {
    data: { text },
  } = await worker.recognize(buffer);
  return text;
}

// Exposed for graceful shutdown (e.g. Nest OnModuleDestroy hooks); not required for correctness.
export async function terminateOcrWorker(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}
