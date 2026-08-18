import { runStudyRepositoryContractTests } from "../../contract-tests/study-repository.contract";
import { InMemoryStudyRepository } from "../in-memory-study-repository";

runStudyRepositoryContractTests(() => new InMemoryStudyRepository());
