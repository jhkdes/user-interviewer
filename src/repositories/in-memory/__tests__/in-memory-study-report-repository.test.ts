import { runStudyReportRepositoryContractTests } from "../../contract-tests/study-report-repository.contract";
import { InMemoryStudyReportRepository } from "../in-memory-study-report-repository";

const DUMMY_STUDY_ID = "study-1";

runStudyReportRepositoryContractTests(
  () => new InMemoryStudyReportRepository(),
  () => DUMMY_STUDY_ID,
);
