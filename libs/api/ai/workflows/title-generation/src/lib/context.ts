export interface TitleAttachmentPreview {
  originalName: string;
  mimeType: string;
  text: string;
}

export interface TitleContextInput {
  messageContent: string;
  attachments: TitleAttachmentPreview[];
  perAttachmentMaxChars: number;
}

export interface TitleContextResult {
  prompt: string;
  promptChars: number;
  truncated: boolean;
}

export function buildTitleUserPrompt(
  input: TitleContextInput,
): TitleContextResult {
  let truncated = false;
  const attachmentLines = input.attachments.map((attachment) => {
    const available = attachment.text.trim();
    const body =
      available.length === 0
        ? "[text not yet extracted]"
        : available.length > input.perAttachmentMaxChars
          ? `${available.slice(0, input.perAttachmentMaxChars)}…`
          : available;
    if (available.length > input.perAttachmentMaxChars) truncated = true;
    const fileLine = `- ${attachment.originalName} (${attachment.mimeType}):`;
    return available.length === 0
      ? `${fileLine} [text not yet extracted]`
      : `${fileLine}\n${body}`;
  });

  const attachmentsBlock =
    attachmentLines.length === 0
      ? "No attachments."
      : attachmentLines.join("\n\n");

  const prompt = `First user message:\n${input.messageContent.trim() || "(attachment only)"}\n\nAttachment previews:\n${attachmentsBlock}`;
  return { prompt, promptChars: prompt.length, truncated };
}