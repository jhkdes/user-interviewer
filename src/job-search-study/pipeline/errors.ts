export class ReportNotFoundError extends Error {
  constructor(reportId: string) {
    super(`No job-search report found for id: ${reportId}`);
    this.name = "ReportNotFoundError";
  }
}

/** The action is not allowed in the report's current state, for example editing a report that has already been released. */
export class InvalidReportStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReportStateError";
  }
}

/** The edits are not acceptable, for example an empty executive summary or an unknown experiment id. */
export class InvalidReportEditsError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid report edits: ${problems.join("; ")}`);
    this.name = "InvalidReportEditsError";
  }
}

/** Release was refused because the report still has rule violations and the reviewer has not acknowledged them. */
export class ReleaseBlockedError extends Error {
  constructor(public readonly violations: string[]) {
    super(
      `The report has ${violations.length} unresolved rule violation(s); acknowledge them to release anyway.`,
    );
    this.name = "ReleaseBlockedError";
  }
}
