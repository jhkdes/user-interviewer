import { describe, expect, it } from "vitest";
import type { InterviewMessageRepository } from "../interview-message-repository";
import type { InterviewRepository } from "../interview-repository";
import { NONEXISTENT_ID } from "./nonexistent-id";

export interface InterviewMessageContractContext {
  messageRepo: InterviewMessageRepository;
  /** A repository over the same backing store, used to create the interviews the messages belong to. */
  interviewRepo: InterviewRepository;
}

/**
 * Shared behavioral contract for any InterviewMessageRepository
 * implementation. Messages can only be appended to an `in-progress`
 * interview, so every test creates one through `interviewRepo`.
 * `getStudyId` is a getter for the same reason as in the interview contract.
 */
export function runInterviewMessageRepositoryContractTests(
  makeContext: () => InterviewMessageContractContext | Promise<InterviewMessageContractContext>,
  getStudyId: () => string,
) {
  async function createInterview(
    interviewRepo: InterviewRepository,
    status: "pending" | "in-progress" | "completed" = "in-progress",
  ) {
    const created = await interviewRepo.create({
      studyId: getStudyId(),
      firstName: "Alex",
      email: "alex@example.com",
      mode: "text",
    });
    return status === "pending" ? created : interviewRepo.update(created.id, { status });
  }

  describe("InterviewMessageRepository contract", () => {
    it("assigns seq 1, 2, 3 in append order and lists them in order", async () => {
      const { messageRepo, interviewRepo } = await makeContext();
      const interview = await createInterview(interviewRepo);

      const first = await messageRepo.append({
        interviewId: interview.id,
        speaker: "interviewer",
        text: "Hi Alex, thanks for joining.",
      });
      const second = await messageRepo.append({
        interviewId: interview.id,
        speaker: "participant",
        text: "Hello!",
        clientMessageId: "m-1",
      });
      const third = await messageRepo.append({
        interviewId: interview.id,
        speaker: "interviewer",
        text: "What stood out today?",
      });

      expect(first.outcome).toBe("appended");
      expect(second.outcome).toBe("appended");
      expect(third.outcome).toBe("appended");
      const listed = await messageRepo.listByInterviewId(interview.id);
      expect(listed.map((m) => m.seq)).toEqual([1, 2, 3]);
      expect(listed.map((m) => m.speaker)).toEqual(["interviewer", "participant", "interviewer"]);
      expect(listed.map((m) => m.text)).toEqual([
        "Hi Alex, thanks for joining.",
        "Hello!",
        "What stood out today?",
      ]);
      expect(listed[0].interviewId).toBe(interview.id);
      expect(listed[0].clientMessageId).toBeNull();
      expect(listed[1].clientMessageId).toBe("m-1");
      expect(listed[0].createdAt).toBeInstanceOf(Date);
      expect(listed[0].id).toBeTruthy();
      if (first.outcome === "appended") expect(first.message).toEqual(listed[0]);
    });

    it("lists nothing for an interview with no messages", async () => {
      const { messageRepo, interviewRepo } = await makeContext();
      const interview = await createInterview(interviewRepo);

      expect(await messageRepo.listByInterviewId(interview.id)).toEqual([]);
    });

    it("keeps messages of different interviews separate, each with its own seq", async () => {
      const { messageRepo, interviewRepo } = await makeContext();
      const a = await createInterview(interviewRepo);
      const b = await createInterview(interviewRepo);

      await messageRepo.append({ interviewId: a.id, speaker: "interviewer", text: "A1" });
      await messageRepo.append({ interviewId: a.id, speaker: "participant", text: "A2" });
      const firstOfB = await messageRepo.append({
        interviewId: b.id,
        speaker: "interviewer",
        text: "B1",
      });

      expect(firstOfB.outcome === "appended" && firstOfB.message.seq).toBe(1);
      expect((await messageRepo.listByInterviewId(a.id)).map((m) => m.text)).toEqual(["A1", "A2"]);
      expect((await messageRepo.listByInterviewId(b.id)).map((m) => m.text)).toEqual(["B1"]);
    });

    describe("idempotency by clientMessageId", () => {
      it("returns the stored message as a duplicate and writes nothing new", async () => {
        const { messageRepo, interviewRepo } = await makeContext();
        const interview = await createInterview(interviewRepo);
        const first = await messageRepo.append({
          interviewId: interview.id,
          speaker: "participant",
          text: "My answer",
          clientMessageId: "m-1",
        });

        const retry = await messageRepo.append({
          interviewId: interview.id,
          speaker: "participant",
          text: "My answer",
          clientMessageId: "m-1",
        });

        expect(retry.outcome).toBe("duplicate");
        if (first.outcome === "appended" && retry.outcome === "duplicate") {
          expect(retry.message).toEqual(first.message);
        }
        expect(await messageRepo.listByInterviewId(interview.id)).toHaveLength(1);
      });

      it("treats the same clientMessageId on different interviews as different messages", async () => {
        const { messageRepo, interviewRepo } = await makeContext();
        const a = await createInterview(interviewRepo);
        const b = await createInterview(interviewRepo);

        const first = await messageRepo.append({
          interviewId: a.id,
          speaker: "participant",
          text: "x",
          clientMessageId: "m-1",
        });
        const second = await messageRepo.append({
          interviewId: b.id,
          speaker: "participant",
          text: "x",
          clientMessageId: "m-1",
        });

        expect(first.outcome).toBe("appended");
        expect(second.outcome).toBe("appended");
      });

      it("still answers a retry with the stored message after the interview has completed", async () => {
        const { messageRepo, interviewRepo } = await makeContext();
        const interview = await createInterview(interviewRepo);
        await messageRepo.append({
          interviewId: interview.id,
          speaker: "participant",
          text: "Last words",
          clientMessageId: "m-last",
        });
        await interviewRepo.update(interview.id, { status: "completed" });

        const retry = await messageRepo.append({
          interviewId: interview.id,
          speaker: "participant",
          text: "Last words",
          clientMessageId: "m-last",
        });

        expect(retry.outcome).toBe("duplicate");
      });

      it("allows many interviewer messages (no clientMessageId) in one interview", async () => {
        const { messageRepo, interviewRepo } = await makeContext();
        const interview = await createInterview(interviewRepo);

        for (const text of ["one", "two", "three"]) {
          const result = await messageRepo.append({
            interviewId: interview.id,
            speaker: "interviewer",
            text,
          });
          expect(result.outcome).toBe("appended");
        }
      });
    });

    describe("afterSeq (optimistic concurrency)", () => {
      it("appends when afterSeq matches the current last seq", async () => {
        const { messageRepo, interviewRepo } = await makeContext();
        const interview = await createInterview(interviewRepo);

        const first = await messageRepo.append({
          interviewId: interview.id,
          speaker: "interviewer",
          text: "Hi",
          afterSeq: 0,
        });
        const second = await messageRepo.append({
          interviewId: interview.id,
          speaker: "participant",
          text: "Hello",
          afterSeq: 1,
        });

        expect(first.outcome).toBe("appended");
        expect(second.outcome).toBe("appended");
      });

      it("returns conflict and writes nothing when afterSeq is stale", async () => {
        const { messageRepo, interviewRepo } = await makeContext();
        const interview = await createInterview(interviewRepo);
        await messageRepo.append({ interviewId: interview.id, speaker: "interviewer", text: "Hi" });
        await messageRepo.append({ interviewId: interview.id, speaker: "participant", text: "Yo" });

        const stale = await messageRepo.append({
          interviewId: interview.id,
          speaker: "interviewer",
          text: "A reply to an old state",
          afterSeq: 1,
        });

        expect(stale.outcome).toBe("conflict");
        expect(await messageRepo.listByInterviewId(interview.id)).toHaveLength(2);
      });

      it("returns conflict when afterSeq is ahead of the current last seq", async () => {
        const { messageRepo, interviewRepo } = await makeContext();
        const interview = await createInterview(interviewRepo);

        const result = await messageRepo.append({
          interviewId: interview.id,
          speaker: "interviewer",
          text: "Hi",
          afterSeq: 5,
        });

        expect(result.outcome).toBe("conflict");
      });
    });

    it("lets only one of two concurrent appends with the same afterSeq win", async () => {
      const { messageRepo, interviewRepo } = await makeContext();
      const interview = await createInterview(interviewRepo);
      await messageRepo.append({ interviewId: interview.id, speaker: "interviewer", text: "Q1" });

      const results = await Promise.all([
        messageRepo.append({
          interviewId: interview.id,
          speaker: "participant",
          text: "from tab A",
          afterSeq: 1,
        }),
        messageRepo.append({
          interviewId: interview.id,
          speaker: "participant",
          text: "from tab B",
          afterSeq: 1,
        }),
      ]);

      expect(results.filter((r) => r.outcome === "appended")).toHaveLength(1);
      expect(results.filter((r) => r.outcome === "conflict")).toHaveLength(1);
      const listed = await messageRepo.listByInterviewId(interview.id);
      expect(listed.map((m) => m.seq)).toEqual([1, 2]);
    });

    it("never produces duplicate or skipped seq values under concurrent appends without afterSeq", async () => {
      const { messageRepo, interviewRepo } = await makeContext();
      const interview = await createInterview(interviewRepo);

      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          messageRepo.append({
            interviewId: interview.id,
            speaker: "participant",
            text: `msg ${i}`,
          }),
        ),
      );

      const appended = results.filter((r) => r.outcome === "appended");
      expect(appended.length).toBeGreaterThanOrEqual(1);
      expect(results.every((r) => r.outcome === "appended" || r.outcome === "conflict")).toBe(true);
      const seqs = (await messageRepo.listByInterviewId(interview.id)).map((m) => m.seq);
      expect(seqs).toEqual(Array.from({ length: appended.length }, (_, i) => i + 1));
    });

    describe("interview state", () => {
      it("rejects an append to a pending interview", async () => {
        const { messageRepo, interviewRepo } = await makeContext();
        const interview = await createInterview(interviewRepo, "pending");

        const result = await messageRepo.append({
          interviewId: interview.id,
          speaker: "interviewer",
          text: "Hi",
        });

        expect(result.outcome).toBe("interview-not-in-progress");
        expect(await messageRepo.listByInterviewId(interview.id)).toEqual([]);
      });

      it("rejects an append to a completed interview", async () => {
        const { messageRepo, interviewRepo } = await makeContext();
        const interview = await createInterview(interviewRepo);
        await messageRepo.append({ interviewId: interview.id, speaker: "interviewer", text: "Hi" });
        await interviewRepo.update(interview.id, { status: "completed" });

        const result = await messageRepo.append({
          interviewId: interview.id,
          speaker: "participant",
          text: "Too late",
        });

        expect(result.outcome).toBe("interview-not-in-progress");
        expect(await messageRepo.listByInterviewId(interview.id)).toHaveLength(1);
      });

      it("reports an unknown interview", async () => {
        const { messageRepo } = await makeContext();

        const result = await messageRepo.append({
          interviewId: NONEXISTENT_ID,
          speaker: "interviewer",
          text: "Hi",
        });

        expect(result.outcome).toBe("interview-not-found");
      });
    });

    describe("listInterviewIdsWithMessages", () => {
      it("lists each interview that has messages once, and none without", async () => {
        const { messageRepo, interviewRepo } = await makeContext();
        const withMessages = await createInterview(interviewRepo);
        const alsoWithMessages = await createInterview(interviewRepo);
        const without = await createInterview(interviewRepo);
        await messageRepo.append({
          interviewId: withMessages.id,
          speaker: "interviewer",
          text: "one",
        });
        await messageRepo.append({
          interviewId: withMessages.id,
          speaker: "participant",
          text: "two",
        });
        await messageRepo.append({
          interviewId: alsoWithMessages.id,
          speaker: "interviewer",
          text: "three",
        });

        const ids = await messageRepo.listInterviewIdsWithMessages(10);

        expect([...ids].sort()).toEqual([withMessages.id, alsoWithMessages.id].sort());
        expect(ids).not.toContain(without.id);
      });

      it("respects the limit", async () => {
        const { messageRepo, interviewRepo } = await makeContext();
        for (let i = 0; i < 3; i++) {
          const interview = await createInterview(interviewRepo);
          await messageRepo.append({
            interviewId: interview.id,
            speaker: "interviewer",
            text: `hi ${i}`,
          });
        }

        expect(await messageRepo.listInterviewIdsWithMessages(2)).toHaveLength(2);
      });
    });

    describe("deleteByInterviewId", () => {
      it("removes only that interview's messages", async () => {
        const { messageRepo, interviewRepo } = await makeContext();
        const a = await createInterview(interviewRepo);
        const b = await createInterview(interviewRepo);
        await messageRepo.append({ interviewId: a.id, speaker: "interviewer", text: "A1" });
        await messageRepo.append({ interviewId: a.id, speaker: "participant", text: "A2" });
        await messageRepo.append({ interviewId: b.id, speaker: "interviewer", text: "B1" });

        await messageRepo.deleteByInterviewId(a.id);

        expect(await messageRepo.listByInterviewId(a.id)).toEqual([]);
        expect(await messageRepo.listByInterviewId(b.id)).toHaveLength(1);
      });

      it("is a no-op when the interview has no messages", async () => {
        const { messageRepo, interviewRepo } = await makeContext();
        const interview = await createInterview(interviewRepo);

        await expect(messageRepo.deleteByInterviewId(interview.id)).resolves.toBeUndefined();
      });

      it("is a no-op for an unknown interview", async () => {
        const { messageRepo } = await makeContext();

        await expect(messageRepo.deleteByInterviewId(NONEXISTENT_ID)).resolves.toBeUndefined();
      });
    });
  });
}
