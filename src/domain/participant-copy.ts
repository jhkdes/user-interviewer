/**
 * Text a PM can customize on a study's participant-facing pages: the landing
 * (intro) page and the ending page shown after the interview. Text only: the
 * layout is fixed. Every field is optional, and one that is left out falls back
 * to the default wording (see src/participant-copy), so a study with no custom
 * copy looks exactly as it always has.
 */

export interface IntroStep {
  title: string;
  body: string;
}

export interface IntroCopy {
  /** Replaces the sentence under the title ("A 15-minute AI-run interview about ..."). */
  tagline?: string;
  /** The short chips under the tagline, for example "~15 minutes". */
  facts?: string[];
  /** The numbered "How it works" steps. */
  steps?: IntroStep[];
  /** The recording and consent note under the Start button. */
  consentNote?: string;
}

export interface CompletionCopy {
  title?: string;
  message?: string;
}

export interface ParticipantCopy {
  intro?: IntroCopy;
  completion?: CompletionCopy;
}
