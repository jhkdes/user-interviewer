import { randomUUID } from "node:crypto";
import { runPartnerIdempotencyRepositoryContractTests } from "../../contract-tests/partner-idempotency-repository.contract";
import { InMemoryPartnerIdempotencyRepository } from "../in-memory-partner-idempotency-repository";

runPartnerIdempotencyRepositoryContractTests(async () => ({
  repo: new InMemoryPartnerIdempotencyRepository(),
  partnerId: randomUUID(),
  otherPartnerId: randomUUID(),
}));
