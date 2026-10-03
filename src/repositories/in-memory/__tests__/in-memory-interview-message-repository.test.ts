import { runInterviewMessageRepositoryContractTests } from "../../contract-tests/interview-message-repository.contract";
import { InMemoryInterviewMessageRepository } from "../in-memory-interview-message-repository";
import { InMemoryInterviewRepository } from "../in-memory-interview-repository";

const DUMMY_STUDY_ID = "study-1";

runInterviewMessageRepositoryContractTests(
  () => {
    const interviewRepo = new InMemoryInterviewRepository();
    return { interviewRepo, messageRepo: new InMemoryInterviewMessageRepository(interviewRepo) };
  },
  () => DUMMY_STUDY_ID,
);
