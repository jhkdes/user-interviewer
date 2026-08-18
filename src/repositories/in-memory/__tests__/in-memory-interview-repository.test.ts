import { runInterviewRepositoryContractTests } from "../../contract-tests/interview-repository.contract";
import { InMemoryInterviewRepository } from "../in-memory-interview-repository";

const DUMMY_STUDY_ID = "study-1";

runInterviewRepositoryContractTests(
  () => new InMemoryInterviewRepository(),
  () => DUMMY_STUDY_ID,
);
