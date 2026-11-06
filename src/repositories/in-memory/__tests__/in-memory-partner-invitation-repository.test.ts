import { randomUUID } from "node:crypto";
import { runPartnerInvitationRepositoryContractTests } from "../../contract-tests/partner-invitation-repository.contract";
import { InMemoryPartnerInvitationRepository } from "../in-memory-partner-invitation-repository";

runPartnerInvitationRepositoryContractTests(() => ({
  invitations: new InMemoryPartnerInvitationRepository(),
  newStudyId: async () => randomUUID(),
}));
