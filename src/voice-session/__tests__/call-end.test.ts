import { describe, expect, it } from "vitest";
import { classifyElevenLabsEnd, classifyVapiEnd } from "../call-end";

describe("classifyElevenLabsEnd", () => {
  it("calls an interview the interviewer ended finished", () => {
    const result = classifyElevenLabsEnd({
      status: "done",
      metadata: { termination_reason: "end_call tool was called.", call_duration_secs: 859 },
      analysis: { call_successful: "success" },
    });

    expect(result.endCause).toBe("finished");
    expect(result.endDetail).toMatchObject({
      provider: "elevenlabs",
      status: "done",
      callSuccessful: "success",
      terminationReason: "end_call tool was called.",
      errorType: null,
      durationSecs: 859,
    });
  });

  it("calls a dropped connection interrupted and keeps ElevenLabs' own words about it", () => {
    // The shape of the real call that dropped after 209 seconds.
    const result = classifyElevenLabsEnd({
      status: "failed",
      metadata: {
        call_duration_secs: 209,
        termination_reason:
          "No user message received for a long period of time - probably a network error occurred.",
        error: {
          code: 1002,
          reason:
            "No user message received for 60 seconds - the websocket connection was closed, or a network error occurred.",
          error_type: "client_disconnected",
        },
      },
      analysis: { call_successful: "failure" },
    });

    expect(result.endCause).toBe("interrupted");
    expect(result.endDetail).toMatchObject({
      status: "failed",
      callSuccessful: "failure",
      errorType: "client_disconnected",
      errorCode: 1002,
      durationSecs: 209,
    });
    expect(result.endDetail?.terminationReason).toMatch(/network error/);
    expect(result.endDetail?.errorReason).toMatch(/No user message received for 60 seconds/);
  });

  it("calls any other way of ending interrupted, including a clean-looking one that was not the interviewer's", () => {
    expect(
      classifyElevenLabsEnd({
        status: "done",
        metadata: { termination_reason: "Call ended by user." },
      }).endCause,
    ).toBe("interrupted");
  });

  it("is interrupted when there is an error, even if the termination text looks normal", () => {
    expect(
      classifyElevenLabsEnd({
        status: "done",
        metadata: {
          termination_reason: "end_call tool was called.",
          error: { code: 1011, error_type: "internal_error" },
        },
      }).endCause,
    ).toBe("interrupted");
  });

  it("records nothing when the payload says nothing about how the call ended", () => {
    expect(classifyElevenLabsEnd({})).toEqual({ endCause: null, endDetail: null });
    expect(classifyElevenLabsEnd({ analysis: { call_successful: "success" } })).toEqual({
      endCause: null,
      endDetail: null,
    });
  });
});

describe("classifyVapiEnd", () => {
  it("calls the assistant ending the call finished, and anything else interrupted", () => {
    expect(classifyVapiEnd("assistant-said-end-call-phrase").endCause).toBe("finished");
    expect(classifyVapiEnd("assistant-ended-call").endCause).toBe("finished");
    expect(classifyVapiEnd("silence-timed-out")).toEqual({
      endCause: "interrupted",
      endDetail: { provider: "vapi", endedReason: "silence-timed-out" },
    });
    expect(classifyVapiEnd("customer-ended-call").endCause).toBe("interrupted");
  });

  it("records nothing without an end reason", () => {
    expect(classifyVapiEnd(null)).toEqual({ endCause: null, endDetail: null });
    expect(classifyVapiEnd(undefined)).toEqual({ endCause: null, endDetail: null });
  });
});
