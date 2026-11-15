import { describe, expect, it } from "vitest";
import { InMemoryPartnerRepository } from "@/repositories/in-memory/in-memory-partner-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { loadPartnerStudy } from "../scope";

async function setup() {
  const partners = new InMemoryPartnerRepository();
  const studies = new InMemoryStudyRepository();
  const a = await partners.create({ name: "a", keyHash: "a".repeat(64) });
  const b = await partners.create({ name: "b", keyHash: "b".repeat(64) });
  const base = {
    title: "T",
    description: "D",
    type: "feedback" as const,
    feedbackQuestions: ["Q"],
    preInterviewQuestions: [],
  };
  const aStudy = await studies.create({
    ...base,
    linkToken: "l1",
    partnerId: a.id,
    ownerRef: "user_1",
  });
  const dashboardStudy = await studies.create({ ...base, linkToken: "l2" });
  return { studies, a, b, aStudy, dashboardStudy };
}

const req = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/x", { headers });

describe("loadPartnerStudy", () => {
  it("returns the partner's own study", async () => {
    const { studies, a, aStudy } = await setup();

    const result = await loadPartnerStudy(a, studies, aStudy.id, req(), "r");

    expect(result).toMatchObject({ ok: true, study: { id: aStudy.id } });
  });

  it("answers 404 for another partner's study, a dashboard study, an unknown id and a malformed id alike", async () => {
    const { studies, a, b, aStudy, dashboardStudy } = await setup();
    const attempts = [
      loadPartnerStudy(b, studies, aStudy.id, req(), "r"),
      loadPartnerStudy(a, studies, dashboardStudy.id, req(), "r"),
      loadPartnerStudy(a, studies, "00000000-0000-4000-8000-000000000000", req(), "r"),
      loadPartnerStudy(a, studies, "not-a-uuid", req(), "r"),
    ];

    const bodies: string[] = [];
    for (const result of await Promise.all(attempts)) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.response.status).toBe(404);
      bodies.push(await result.response.text());
    }
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0])).toEqual({
      error: { code: "not_found", message: "Study not found." },
    });
  });

  describe("with X-Owner-Ref required", () => {
    const options = { requireOwnerRef: true };

    it("accepts a matching owner", async () => {
      const { studies, a, aStudy } = await setup();

      const result = await loadPartnerStudy(
        a,
        studies,
        aStudy.id,
        req({ "X-Owner-Ref": "user_1" }),
        "r",
        options,
      );

      expect(result.ok).toBe(true);
    });

    it("rejects a missing header with 400 and a different owner with 409", async () => {
      const { studies, a, aStudy } = await setup();

      const missing = await loadPartnerStudy(a, studies, aStudy.id, req(), "r", options);
      const wrong = await loadPartnerStudy(
        a,
        studies,
        aStudy.id,
        req({ "X-Owner-Ref": "user_2" }),
        "r",
        options,
      );

      expect(missing.ok || missing.response.status).toBe(400);
      expect(wrong.ok || wrong.response.status).toBe(409);
    });

    it("never reveals a study's owner to a partner who does not own the study", async () => {
      const { studies, b, aStudy } = await setup();

      const result = await loadPartnerStudy(
        b,
        studies,
        aStudy.id,
        req({ "X-Owner-Ref": "user_1" }),
        "r",
        options,
      );

      expect(result.ok || result.response.status).toBe(404);
    });
  });
});
