"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Report } from "@/job-search-study/report/types";

interface Props {
  studyId: string;
  reportId: string;
  status: string;
  report: Report | null;
  violations: string[];
  library: Array<{ id: string; title: string; track: string }>;
  shareUrl: string | null;
  emailSent: boolean;
}

const BTN = "rounded px-3 py-1.5 text-sm disabled:opacity-60";
const PRIMARY = `${BTN} bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200`;
const SECONDARY = `${BTN} border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800`;
const FIELD =
  "mt-1 w-full rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700";

export function ReviewPanel({
  studyId,
  reportId,
  status,
  report,
  violations,
  library,
  shareUrl,
  emailSent,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [acknowledge, setAcknowledge] = useState(false);

  const [priority, setPriority] = useState(report?.priority ?? "");
  const [executiveSummary, setExecutiveSummary] = useState(report?.executiveSummary ?? "");
  const [whatWeHeard, setWhatWeHeard] = useState(report?.whatWeHeard ?? "");
  const [channelsNarrative, setChannelsNarrative] = useState(report?.channelsNarrative ?? "");
  const [bottomLine, setBottomLine] = useState(report?.bottomLine ?? "");
  const [dimensionText, setDimensionText] = useState<
    Record<string, { strengthText: string; improvementText: string }>
  >(
    Object.fromEntries(
      (report?.dimensions ?? []).map((d) => [
        d.id,
        { strengthText: d.strengthText, improvementText: d.improvementText },
      ]),
    ),
  );
  const [experimentIds, setExperimentIds] = useState<string[]>(
    report?.experiments.map((e) => e.id) ?? [],
  );

  const base = `/api/studies/${studyId}/job-search-reports/${reportId}`;

  async function call(label: string, url: string, init: RequestInit, successMessage: string) {
    setBusy(label);
    setMessage(null);
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    setBusy(null);
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      problems?: string[];
      emailSent?: boolean;
      emailError?: string;
    } | null;
    if (!res.ok) {
      setMessage([body?.error ?? "That did not work.", ...(body?.problems ?? [])].join(" "));
      return;
    }
    if (body && body.emailSent === false) {
      setMessage(
        `Done, but the email was not sent: ${body.emailError ?? "unknown error"}. Use "Resend email" once it is fixed.`,
      );
    } else {
      setMessage(successMessage);
    }
    router.refresh();
  }

  const save = () =>
    call(
      "save",
      base,
      {
        method: "PATCH",
        body: JSON.stringify({
          priority,
          executiveSummary,
          whatWeHeard,
          channelsNarrative,
          bottomLine,
          dimensions: Object.entries(dimensionText).map(([id, text]) => ({ id, ...text })),
          experimentIds,
        }),
      },
      "Saved. The preview now shows your edits.",
    );

  const act = (action: string, successMessage: string, body: object = {}) =>
    call(
      action,
      `${base}/${action}`,
      { method: "POST", body: JSON.stringify(body) },
      successMessage,
    );

  const toggleExperiment = (id: string) =>
    setExperimentIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const textFields = [
    ["What they most want help with (their words)", priority, setPriority, 2],
    ["Executive summary", executiveSummary, setExecutiveSummary, 4],
    ["What we heard", whatWeHeard, setWhatWeHeard, 4],
    ["Where conversations come from", channelsNarrative, setChannelsNarrative, 3],
    ["Bottom line", bottomLine, setBottomLine, 3],
  ] as const;

  return (
    <div className="mt-6 space-y-6">
      {message && (
        <p className="rounded bg-neutral-100 p-3 text-sm dark:bg-neutral-900">{message}</p>
      )}

      {status === "released" && shareUrl && (
        <div className="rounded border border-green-300 p-3 text-sm dark:border-green-800">
          <p className="font-medium">
            Released{emailSent ? " and emailed" : " (the email has not been sent)"}.
          </p>
          <p className="mt-1 break-all">
            Private link:{" "}
            <a href={shareUrl} className="underline" target="_blank" rel="noreferrer">
              {shareUrl}
            </a>
          </p>
          <div className="mt-3 flex gap-2">
            <button
              className={SECONDARY}
              disabled={busy !== null}
              onClick={() => void act("resend-email", "Email sent again.")}
            >
              Resend email
            </button>
            <button
              className={SECONDARY}
              disabled={busy !== null}
              onClick={() => {
                if (confirm("Withdraw this report? The link stops working immediately."))
                  void act("withdraw", "Withdrawn.");
              }}
            >
              Withdraw
            </button>
          </div>
        </div>
      )}

      {status === "draft" && report && (
        <>
          <section>
            <h2 className="font-semibold">Edit the wording</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Scores, bands, and tables are computed from the evidence and cannot be edited here.
              Rule checks re-run when you save.
            </p>
            {textFields.map(([label, value, set, rows]) => (
              <label key={label} className="mt-3 block text-sm font-medium">
                {label}
                <textarea
                  className={FIELD}
                  rows={rows}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                />
              </label>
            ))}
            {report.dimensions.map((d) => (
              <fieldset
                key={d.id}
                className="mt-4 rounded border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <legend className="px-1 text-sm font-medium">
                  {d.name} · {d.band ?? "Not enough to rate"}
                </legend>
                <label className="block text-sm">
                  Going well
                  <textarea
                    className={FIELD}
                    rows={2}
                    value={dimensionText[d.id]?.strengthText ?? ""}
                    onChange={(e) =>
                      setDimensionText((t) => ({
                        ...t,
                        [d.id]: { ...t[d.id], strengthText: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="mt-2 block text-sm">
                  Worth building
                  <textarea
                    className={FIELD}
                    rows={2}
                    value={dimensionText[d.id]?.improvementText ?? ""}
                    onChange={(e) =>
                      setDimensionText((t) => ({
                        ...t,
                        [d.id]: { ...t[d.id], improvementText: e.target.value },
                      }))
                    }
                  />
                </label>
              </fieldset>
            ))}
            <fieldset className="mt-4 rounded border border-neutral-200 p-3 dark:border-neutral-800">
              <legend className="px-1 text-sm font-medium">Experiments to suggest (up to 3)</legend>
              {library.map((e) => (
                <label key={e.id} className="flex items-start gap-2 py-0.5 text-sm">
                  <input
                    type="checkbox"
                    checked={experimentIds.includes(e.id)}
                    disabled={!experimentIds.includes(e.id) && experimentIds.length >= 3}
                    onChange={() => toggleExperiment(e.id)}
                  />
                  <span>
                    {e.title} <span className="text-neutral-400">({e.track})</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className={PRIMARY} disabled={busy !== null} onClick={() => void save()}>
                {busy === "save" ? "Saving…" : "Save edits"}
              </button>
              <button
                className={SECONDARY}
                disabled={busy !== null}
                onClick={() => {
                  if (
                    confirm("Rewrite the text from the stored evidence? This discards your edits.")
                  ) {
                    void act("regenerate", "Text rewritten.");
                  }
                }}
              >
                {busy === "regenerate" ? "Rewriting…" : "Regenerate text"}
              </button>
            </div>
          </section>

          <section className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
            <h2 className="font-semibold">Release</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Emails the participant their report as an attached PDF, with the short version in the
              email itself. The preview below shows the same content; use the PDF link to see the
              exact file. Save your edits first.
            </p>
            {violations.length > 0 && (
              <label className="mt-2 flex items-start gap-2 text-sm text-red-700 dark:text-red-400">
                <input
                  type="checkbox"
                  checked={acknowledge}
                  onChange={(e) => setAcknowledge(e.target.checked)}
                />
                <span>
                  I have read the {violations.length} rule violation(s) above and want to release
                  anyway.
                </span>
              </label>
            )}
            <button
              className={`${PRIMARY} mt-3`}
              disabled={busy !== null || (violations.length > 0 && !acknowledge)}
              onClick={() => {
                if (confirm("Release this report and email the participant?")) {
                  void act("release", "Released.", { acknowledgeViolations: acknowledge });
                }
              }}
            >
              {busy === "release" ? "Releasing…" : "Release and email"}
            </button>
          </section>
        </>
      )}

      {["draft", "failed", "skipped"].includes(status) && (
        <button
          className={SECONDARY}
          disabled={busy !== null}
          onClick={() => {
            if (confirm("Throw this work away and analyze the interview again from scratch?")) {
              void act("requeue", "Queued to be analyzed again.");
            }
          }}
        >
          Re-run from scratch
        </button>
      )}

      {status === "withdrawn" && (
        <button
          className={PRIMARY}
          disabled={busy !== null}
          onClick={() =>
            void act("release", "Released again with a new link.", { acknowledgeViolations: true })
          }
        >
          Release again (new link)
        </button>
      )}
    </div>
  );
}
