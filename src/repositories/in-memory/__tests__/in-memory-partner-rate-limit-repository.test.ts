import { randomUUID } from "node:crypto";
import { runPartnerRateLimitRepositoryContractTests } from "../../contract-tests/partner-rate-limit-repository.contract";
import { InMemoryPartnerRateLimitRepository } from "../in-memory-partner-rate-limit-repository";

runPartnerRateLimitRepositoryContractTests(async () => ({
  repo: new InMemoryPartnerRateLimitRepository(),
  partnerId: randomUUID(),
  otherPartnerId: randomUUID(),
}));
