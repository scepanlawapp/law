import { Injectable, OnDestroy, inject, signal } from "@angular/core";
import { SPEECH_RECOGNITION_LOCALES } from "../../shared/models";
import { LocalizationService } from "../localization/localization.service";

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

/** Web Speech API `SpeechRecognitionErrorEvent.error` codes with their own message. */
const SpeechRecognitionErrorCode = {
  NOT_ALLOWED: "not-allowed",
  SERVICE_NOT_ALLOWED: "service-not-allowed",
  NO_SPEECH: "no-speech",
  AUDIO_CAPTURE: "audio-capture",
  NETWORK: "network",
} as const;
type SpeechRecognitionErrorCode =
  (typeof SpeechRecognitionErrorCode)[keyof typeof SpeechRecognitionErrorCode];

const SPEECH_ERROR_LABELS: Readonly<Record<string, string>> = {
  [SpeechRecognitionErrorCode.NOT_ALLOWED]: "speech.notAllowed",
  [SpeechRecognitionErrorCode.SERVICE_NOT_ALLOWED]: "speech.serviceNotAllowed",
  [SpeechRecognitionErrorCode.NO_SPEECH]: "speech.noSpeech",
  [SpeechRecognitionErrorCode.AUDIO_CAPTURE]: "speech.audioCapture",
  [SpeechRecognitionErrorCode.NETWORK]: "speech.network",
} satisfies Record<SpeechRecognitionErrorCode, string>;

const MAX_RESTART_ATTEMPTS = 3;

@Injectable({ providedIn: "root" })
export class SpeechRecognitionService implements OnDestroy {
  private readonly localization = inject(LocalizationService);
  readonly isSupported = signal(false);
  readonly isListening = signal(false);
  readonly transcript = signal("");
  readonly interimTranscript = signal("");
  readonly error = signal("");

  private readonly recognition: SpeechRecognitionInstance | null;
  private shouldRestart = false;
  private restartAttempts = 0;

  constructor() {
    const constructor = this.getConstructor();
    this.isSupported.set(Boolean(constructor));
    this.recognition = constructor ? new constructor() : null;

    if (this.recognition) this.configureRecognition(this.recognition);
  }

  start(): void {
    if (!this.recognition || this.isListening()) return;

    this.transcript.set("");
    this.interimTranscript.set("");
    this.error.set("");
    this.shouldRestart = true;
    this.restartAttempts = 0;
    this.recognition.lang =
      SPEECH_RECOGNITION_LOCALES[this.localization.language()];
    this.startRecognition();
  }

  stop(): void {
    this.shouldRestart = false;
    this.restartAttempts = 0;
    this.isListening.set(false);
    this.recognition?.stop();
  }

  toggle(): void {
    if (this.isListening()) {
      this.stop();
      return;
    }

    this.start();
  }

  reset(): void {
    this.stop();
    this.transcript.set("");
    this.interimTranscript.set("");
    this.error.set("");
  }

  ngOnDestroy(): void {
    this.shouldRestart = false;
    this.detachRecognitionHandlers();
    this.recognition?.abort();
  }

  private configureRecognition(recognition: SpeechRecognitionInstance): void {
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      this.isListening.set(true);
      this.restartAttempts = 0;
    };
    recognition.onresult = (event) => this.handleResult(event);
    recognition.onerror = (event) => this.handleError(event.error);
    recognition.onend = () => this.handleEnd();
  }

  private startRecognition(): void {
    if (!this.recognition || !this.shouldRestart) return;

    try {
      this.recognition.start();
    } catch {
      this.isListening.set(false);
      this.shouldRestart = false;
      this.error.set(this.localization.translate("speech.startError"));
    }
  }

  private handleResult(event: SpeechRecognitionEventLike): void {
    let interim = "";

    for (
      let index = event.resultIndex;
      index < event.results.length;
      index += 1
    ) {
      const result = event.results[index];
      const text = result[0]?.transcript.trim();
      if (!text) continue;

      if (result.isFinal) {
        this.transcript.update((current) => this.joinTranscript(current, text));
      } else {
        interim = this.joinTranscript(interim, text);
      }
    }

    this.interimTranscript.set(interim);
  }

  private handleError(errorCode: string): void {
    const translationKey =
      SPEECH_ERROR_LABELS[errorCode] ?? "speech.genericError";

    this.error.set(this.localization.translate(translationKey));
    if (errorCode !== SpeechRecognitionErrorCode.NO_SPEECH) {
      this.shouldRestart = false;
      this.isListening.set(false);
    }
  }

  private handleEnd(): void {
    this.interimTranscript.set("");
    if (!this.shouldRestart) {
      this.isListening.set(false);
      return;
    }

    if (this.restartAttempts >= MAX_RESTART_ATTEMPTS) {
      this.shouldRestart = false;
      this.isListening.set(false);
      return;
    }

    this.restartAttempts += 1;
    this.startRecognition();
  }

  private joinTranscript(current: string, addition: string): string {
    return current ? `${current} ${addition}` : addition;
  }

  private getConstructor(): SpeechRecognitionConstructor | undefined {
    if (typeof window === "undefined") return undefined;

    const browserWindow = window as SpeechRecognitionWindow;
    return (
      browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition
    );
  }

  private detachRecognitionHandlers(): void {
    if (!this.recognition) return;
    this.recognition.onstart = null;
    this.recognition.onresult = null;
    this.recognition.onerror = null;
    this.recognition.onend = null;
  }
}
