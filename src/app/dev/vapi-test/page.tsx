"use client";

import { useEffect, useState } from "react";
import Vapi from "@vapi-ai/web";

/**
 * Throwaway manual-testing page for M6's T6.6 acceptance step — lets you
 * actually start a Vapi call against the real assistant/webhook/custom-LLM
 * routes from a browser, since @vapi-ai/web needs real mic/WebRTC access
 * and can't run as a Node script. Not part of the product surface; M11
 * replaces this with the real intake -> consent -> live-interview flow.
 */
export default function VapiTestPage() {
  const [assistantId, setAssistantId] = useState("");
  const [interviewId, setInterviewId] = useState("");
  const [status, setStatus] = useState("idle");
  const [log, setLog] = useState<string[]>([]);
  const [vapi] = useState(() => {
    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    return publicKey ? new Vapi(publicKey) : null;
  });

  useEffect(() => {
    if (!vapi) return;

    const append = (line: string) => setLog((prev) => [...prev, line]);

    vapi.on("call-start", () => {
      setStatus("in-progress");
      append("call-start");
    });
    vapi.on("call-end", () => {
      setStatus("ended");
      append("call-end");
    });
    vapi.on("error", (error: unknown) => {
      setStatus("error");
      append(`error: ${JSON.stringify(error)}`);
    });
    vapi.on("message", (message: unknown) => {
      append(`message: ${JSON.stringify(message)}`);
    });

    return () => {
      vapi.removeAllListeners();
    };
  }, [vapi]);

  if (!vapi) {
    return (
      <main style={{ padding: 24, fontFamily: "monospace" }}>
        Missing <code>NEXT_PUBLIC_VAPI_PUBLIC_KEY</code> in <code>.env.local</code>.
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "monospace", maxWidth: 600 }}>
      <h1>Vapi manual test</h1>

      <label style={{ display: "block", marginTop: 16 }}>
        Assistant ID
        <input
          style={{ display: "block", width: "100%" }}
          value={assistantId}
          onChange={(e) => setAssistantId(e.target.value)}
        />
      </label>

      <label style={{ display: "block", marginTop: 16 }}>
        Interview ID (from starting an interview via the intake API)
        <input
          style={{ display: "block", width: "100%" }}
          value={interviewId}
          onChange={(e) => setInterviewId(e.target.value)}
        />
      </label>

      <div style={{ marginTop: 16 }}>
        <button
          disabled={!assistantId || !interviewId || status === "in-progress"}
          onClick={() => vapi.start(assistantId, { metadata: { interviewId } })}
        >
          Start call
        </button>
        <button
          style={{ marginLeft: 8 }}
          disabled={status !== "in-progress"}
          onClick={() => vapi.stop()}
        >
          Stop call
        </button>
      </div>

      <p>
        Status: <strong>{status}</strong>
      </p>

      <pre style={{ background: "#f0f0f0", padding: 12, maxHeight: 300, overflow: "auto" }}>
        {log.join("\n")}
      </pre>
    </main>
  );
}
