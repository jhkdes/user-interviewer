import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabasePartnerInvitationRepository } from "../supabase-partner-invitation-repository";

/**
 * Paging must not repeat an item when timestamps have microseconds, as Postgres
 * `timestamptz` does. The real-database contract test shows this too, but it is
 * skipped without a Supabase test project, so this one uses a stand-in client
 * that compares times to the microsecond like Postgres does.
 */

/** Microseconds since the epoch, from a timestamp with up to six fractional digits. */
function micros(timestamp: string): bigint {
  const match = timestamp.match(
    /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/,
  );
  if (!match) throw new Error(`Unexpected timestamp: ${timestamp}`);
  const seconds = BigInt(Date.parse(`${match[1]}${match[3] === "Z" ? "Z" : match[3]}`)) * 1000n;
  return seconds + BigInt((match[2] ?? "").padEnd(6, "0"));
}

interface Row {
  id: string;
  study_id: string;
  tracking_id: string;
  colleague_first_name: string;
  context: Record<string, string>;
  created_at: string;
  updated_at: string;
}

/** Just enough of the query builder for `listByStudyId`: select, eq, order, limit, or, then. */
function fakeClient(rows: Row[]): SupabaseClient {
  return {
    from() {
      let result = [...rows];
      let max = Infinity;
      const builder = {
        select: () => builder,
        eq: (column: string, value: string) => {
          result = result.filter((r) => (r as unknown as Record<string, string>)[column] === value);
          return builder;
        },
        order: () => builder,
        limit: (n: number) => {
          max = n;
          return builder;
        },
        or: (filter: string) => {
          const match = filter.match(
            /^created_at\.gt\.(.+?),and\(created_at\.eq\.(.+?),id\.gt\.(.+)\)$/,
          );
          if (!match) throw new Error(`Unexpected filter: ${filter}`);
          const [, gt, eq, id] = match;
          result = result.filter(
            (r) =>
              micros(r.created_at) > micros(gt) ||
              (micros(r.created_at) === micros(eq) && r.id > id),
          );
          return builder;
        },
        then: (resolve: (value: { data: Row[]; error: null }) => void) => {
          const sorted = [...result].sort(
            (a, b) =>
              Number(micros(a.created_at) - micros(b.created_at)) || a.id.localeCompare(b.id),
          );
          resolve({ data: sorted.slice(0, max), error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const row = (id: string, createdAt: string): Row => ({
  id,
  study_id: "study-1",
  tracking_id: `t-${id}`.padEnd(22, "x"),
  colleague_first_name: id,
  context: {},
  created_at: createdAt,
  updated_at: createdAt,
});

describe("SupabasePartnerInvitationRepository paging", () => {
  it("does not repeat an invitation whose stored time has microseconds", async () => {
    // Postgres returns times like these: six fractional digits and a +00:00 offset.
    const rows = [
      row("a", "2026-11-07T12:00:00.123456+00:00"),
      row("b", "2026-11-07T12:00:00.123789+00:00"),
      row("c", "2026-11-07T12:00:00.124001+00:00"),
    ];
    const repo = new SupabasePartnerInvitationRepository(fakeClient(rows));

    const first = await repo.listByStudyId("study-1", { limit: 2 });
    expect(first.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(first.nextCursor).not.toBeNull();

    const second = await repo.listByStudyId("study-1", { limit: 2, cursor: first.nextCursor });
    expect(second.items.map((i) => i.id)).toEqual(["c"]);
    expect(second.nextCursor).toBeNull();
  });

  it("pages through times that agree to the millisecond without repeats or gaps", async () => {
    const rows = ["a", "b", "c", "d", "e"].map((id, n) =>
      row(id, `2026-11-07T12:00:00.123${String(n * 100 + 1).padStart(3, "0")}+00:00`),
    );
    const repo = new SupabasePartnerInvitationRepository(fakeClient(rows));

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await repo.listByStudyId("study-1", { limit: 2, cursor });
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 10);

    expect(seen).toEqual(["a", "b", "c", "d", "e"]);
    expect(pages).toBe(3);
  });
});
