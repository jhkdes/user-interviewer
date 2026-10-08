import { randomUUID } from "node:crypto";
import { InMemoryJobSearchReportRepository } from "../storage/in-memory-report-repository";
import { runJobSearchReportRepositoryContractTests } from "./report-repository.contract";

// One study shared by fixtures created within a single test, so the "list by study" contract test can group them.
let currentStudyId = randomUUID();

runJobSearchReportRepositoryContractTests(
  () => {
    currentStudyId = randomUUID();
    return new InMemoryJobSearchReportRepository();
  },
  async () => ({ interviewId: randomUUID(), studyId: currentStudyId }),
);
