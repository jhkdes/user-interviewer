import type { ChannelAnalysis, Report, ReportDimension } from "./types";

/**
 * Renders a Report as one self-contained HTML page: inline styles, no scripts,
 * no external requests. This is the page a participant opens from their emailed
 * link, so it must read well on a phone, in light and dark mode, and in print.
 * Pure function of the Report: every string is escaped, and nothing here can
 * add a number the Report does not contain.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (c) => ESCAPES[c]);

const paragraphs = (text: string): string =>
  text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");

const chip = (label: string, kind: string) =>
  `<span class="chip chip-${kind}">${escapeHtml(label)}</span>`;

function dimensionBandChip(dimension: ReportDimension): string {
  return dimension.band
    ? chip(dimension.band, dimension.bandId ?? "none")
    : chip("Not enough to rate", "none");
}

const BEHAVIOR_KIND: Record<string, string> = {
  "Doing well": "strong",
  Developing: "developing",
  Opportunity: "opportunity",
  "Not enough to tell": "none",
  "Does not apply": "none",
};

function channelsTable(channels: ChannelAnalysis): string {
  if (channels.rows.length === 0) return "";
  const showEffort = channels.rows.some((r) => r.effortPercent !== null || r.effortNote !== null);
  const head = `<tr><th>Where it came from</th><th class="num">Conversations</th>${showEffort ? "<th>Where your time goes</th>" : ""}</tr>`;
  const body = channels.rows
    .map((row) => {
      const count =
        row.interviews === null
          ? "—"
          : `${row.interviews}${row.interviewSharePercent !== null ? ` (${row.interviewSharePercent}%)` : ""}`;
      const effort =
        row.effortPercent !== null
          ? `${row.effortPercent}%`
          : row.effortNote
            ? escapeHtml(row.effortNote)
            : "—";
      return `<tr><td>${escapeHtml(row.label)}</td><td class="num">${count}</td>${showEffort ? `<td>${effort}</td>` : ""}</tr>`;
    })
    .join("");
  return `<div class="table-wrap"><table>${head}${body}</table></div>`;
}

const CSS = `
:root{--bg:#fbfaf8;--surface:#fff;--text:#1d1d1f;--muted:#5d5d63;--line:#e4e2dd;--accent:#2f5d8a;
--strong-bg:#e3f2e9;--strong-fg:#1b5e3a;--dev-bg:#fdf0d5;--dev-fg:#7a4b00;--opp-bg:#e4ecf8;--opp-fg:#25507f;--none-bg:#eeeeee;--none-fg:#55555a}
@media (prefers-color-scheme:dark){:root{--bg:#161719;--surface:#1f2124;--text:#ececee;--muted:#a3a3ab;--line:#33363b;--accent:#8db6e2;
--strong-bg:#1d3a2b;--strong-fg:#9be0bb;--dev-bg:#3b2f14;--dev-fg:#f2cd85;--opp-bg:#1e3350;--opp-fg:#a9c9ee;--none-bg:#2b2d31;--none-fg:#b5b5bb}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:1.9rem;line-height:1.2;margin:0 0 4px}
h2{font-size:1.3rem;margin:44px 0 12px;padding-top:8px}
h3{font-size:1.05rem;margin:0 0 6px}
p{margin:0 0 12px}
.sub{color:var(--muted);margin:0 0 28px}
.lede{font-size:1.1rem}
.callout{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;padding:14px 16px;margin:20px 0}
.callout p:last-child{margin:0}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:0 0 14px}
.card .q{color:var(--muted);margin:0 0 10px;font-size:.95rem}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin:0 0 8px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.tile .name{font-weight:600;margin:0 0 6px}
.chip{display:inline-block;border-radius:999px;padding:2px 10px;font-size:.82rem;font-weight:600;white-space:nowrap}
.chip-strong{background:var(--strong-bg);color:var(--strong-fg)}
.chip-developing{background:var(--dev-bg);color:var(--dev-fg)}
.chip-opportunity{background:var(--opp-bg);color:var(--opp-fg)}
.chip-none{background:var(--none-bg);color:var(--none-fg)}
ul.behaviors{list-style:none;padding:0;margin:10px 0 12px}
ul.behaviors li{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-top:1px solid var(--line)}
.label-h{font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:12px 0 2px}
.table-wrap{overflow-x:auto;margin:0 0 14px}
table{border-collapse:collapse;width:100%;background:var(--surface);border:1px solid var(--line);border-radius:8px;font-size:.95rem}
th,td{text-align:left;vertical-align:top;padding:9px 12px;border-bottom:1px solid var(--line)}
th{font-size:.82rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
td.num,th.num{text-align:right;white-space:nowrap}
.exp ol{margin:8px 0 10px;padding-left:20px}
.exp .meta{color:var(--muted);font-size:.92rem;margin:0 0 4px}
.empty{color:var(--muted);font-style:italic}
.fine{color:var(--muted);font-size:.9rem;border-top:1px solid var(--line);margin-top:48px;padding-top:16px}
.flow{font-weight:600}
@media print{body{background:#fff;color:#000}.card,.tile,table{break-inside:avoid}}
`;

export function renderReportHtml(report: Report, options: { title?: string } = {}): string {
  const title = options.title ?? "Your Job Search Report";
  const parts: string[] = [];

  parts.push(`<h1>${escapeHtml(title)}</h1><p class="sub">Based on your 15-minute interview</p>`);
  parts.push(`<div class="lede">${paragraphs(report.executiveSummary)}</div>`);

  if (report.priority) {
    parts.push(
      `<div class="callout"><p><strong>What you most want help with</strong></p><p>${escapeHtml(report.priority)}</p></div>`,
    );
  }

  parts.push(
    `<h2>Your search profile</h2><div class="grid">${report.dimensions
      .map(
        (d) =>
          `<div class="tile"><p class="name">${escapeHtml(d.name)}</p>${dimensionBandChip(d)}</div>`,
      )
      .join("")}</div>`,
  );

  parts.push(`<h2>What we heard about your search</h2>${paragraphs(report.whatWeHeard)}`);

  if (report.startingLine.length > 0) {
    parts.push(
      `<h2>Your starting line</h2><p>Here is where your search stands today, in your own numbers. Check them again in a month to see what has changed.</p>` +
        `<div class="table-wrap"><table>${report.startingLine
          .map(
            (row) => `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.value)}</td></tr>`,
          )
          .join("")}</table></div>`,
    );
  }

  if (report.channels.rows.length > 0) {
    parts.push(
      `<h2>Where your interviews are coming from</h2>${channelsTable(report.channels)}${paragraphs(report.channelsNarrative)}`,
    );
  }

  parts.push(
    `<h2>Findings by area</h2>` +
      report.dimensions
        .map((d) => {
          const behaviors = d.behaviors
            .map(
              (b) =>
                `<li><span>${escapeHtml(b.name)}</span>${chip(b.label, BEHAVIOR_KIND[b.label] ?? "none")}</li>`,
            )
            .join("");
          const strength = d.strengthText
            ? `<p class="label-h">What is going well</p>${paragraphs(d.strengthText)}`
            : "";
          const improvement = d.improvementText
            ? `<p class="label-h">Room to grow</p>${paragraphs(d.improvementText)}`
            : "";
          const none = d.band
            ? ""
            : `<p class="empty">There was not enough in the interview to rate this area.</p>`;
          return `<div class="card"><h3>${escapeHtml(d.name)} ${dimensionBandChip(d)}</h3><p class="q">${escapeHtml(d.question)}</p><ul class="behaviors">${behaviors}</ul>${strength}${improvement}${none}</div>`;
        })
        .join(""),
  );

  if (report.context.length > 0) {
    parts.push(
      `<h2>What is affecting your search</h2><p>These details give context. They are not part of your results.</p>` +
        `<div class="table-wrap"><table>${report.context
          .map(
            (row) => `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.value)}</td></tr>`,
          )
          .join("")}</table></div>`,
    );
  }

  if (report.experiments.length > 0) {
    parts.push(
      `<h2>Experiments to try over the next two to four weeks</h2><p>Pick the ones that fit your week. Each is small, and each has one thing to track.</p>` +
        report.experiments
          .map(
            (e, i) =>
              `<div class="card exp"><h3>${i + 1}. ${escapeHtml(e.title)}</h3><p>${escapeHtml(e.why)}</p><ol>${e.steps
                .map((s) => `<li>${escapeHtml(s)}</li>`)
                .join(
                  "",
                )}</ol><p class="meta"><strong>Effort:</strong> ${escapeHtml(e.effort)}</p><p class="meta"><strong>Track:</strong> ${escapeHtml(e.track)}</p></div>`,
          )
          .join(""),
    );
  }

  parts.push(
    `<h2>What to measure</h2><p>Track a small funnel, not just how many applications you send:</p>` +
      `<p class="flow">Roles worth pursuing → Applications and outreach → Human responses → Recruiter conversations → Interviews</p>` +
      `<p>Also note where each conversation came from and how old each role was when you applied. Start from your starting line above, and after a few weeks compare how many interviews you get for every ten roles you pursue, by source.</p>`,
  );

  parts.push(`<h2>Bottom line</h2>${paragraphs(report.bottomLine)}`);

  parts.push(
    `<p class="fine">These bands describe job-search behaviors seen in one interview. They are not a measure of your value or ability as a candidate, and in this early study they are directional, not precise comparisons.</p>`,
  );

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title><style>${CSS}</style></head><body><main>${parts.join("")}</main></body></html>`;
}
