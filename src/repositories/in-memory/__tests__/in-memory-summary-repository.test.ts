import { runSummaryRepositoryContractTests } from "../../contract-tests/summary-repository.contract";
import { InMemorySummaryRepository } from "../in-memory-summary-repository";

const DUMMY_INTERVIEW_ID = "interview-1";

runSummaryRepositoryContractTests(
  () => new InMemorySummaryRepository(),
  () => DUMMY_INTERVIEW_ID,
);
