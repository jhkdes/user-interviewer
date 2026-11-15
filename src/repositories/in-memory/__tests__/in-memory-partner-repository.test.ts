import { runPartnerRepositoryContractTests } from "../../contract-tests/partner-repository.contract";
import { InMemoryPartnerRepository } from "../in-memory-partner-repository";

runPartnerRepositoryContractTests(() => new InMemoryPartnerRepository());
