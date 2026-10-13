import { describe, expect, it } from "vitest";
import { isMissingEndColumns, withoutEndColumns } from "../supabase-interview-repository";

describe("falling back when migration 0023 has not been applied", () => {
  it("recognizes an error about the end_cause or end_detail columns", () => {
    expect(
      isMissingEndColumns({
        message: 'column "end_cause" of relation "interviews" does not exist',
      }),
    ).toBe(true);
    expect(
      isMissingEndColumns({
        message: "Could not find the 'end_detail' column of 'interviews' in the schema cache",
      }),
    ).toBe(true);
  });

  it("does not hide any other error", () => {
    expect(isMissingEndColumns(null)).toBe(false);
    expect(isMissingEndColumns({ message: "duplicate key value violates unique constraint" })).toBe(
      false,
    );
  });

  it("drops just those two columns from an update", () => {
    const row = {
      status: "completed",
      transcript: [],
      ended_reason: "failure",
      end_cause: "interrupted",
      end_detail: { a: 1 },
    };

    expect(withoutEndColumns(row)).toEqual({
      status: "completed",
      transcript: [],
      ended_reason: "failure",
    });
    expect(row.end_cause).toBe("interrupted");
  });
});
