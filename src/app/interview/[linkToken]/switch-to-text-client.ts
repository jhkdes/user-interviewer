/**
 * Asks the server to restart the participant's interview as a typing
 * interview, discarding the voice attempt. Resolves true only when the server
 * confirmed the switch. The caller must wait for this before stopping the
 * voice call — see `switchToText` on the server for why the order matters.
 */
export async function requestSwitchToText(interviewId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/interviews/${interviewId}/switch-to-text`, {
      method: "POST",
    });
    return response.ok;
  } catch {
    return false;
  }
}
