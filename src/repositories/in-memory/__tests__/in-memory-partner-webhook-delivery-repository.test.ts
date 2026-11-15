import { randomUUID } from "node:crypto";
import { runPartnerWebhookDeliveryRepositoryContractTests } from "../../contract-tests/partner-webhook-delivery-repository.contract";
import { InMemoryPartnerWebhookDeliveryRepository } from "../in-memory-partner-webhook-delivery-repository";

runPartnerWebhookDeliveryRepositoryContractTests(() => ({
  deliveries: new InMemoryPartnerWebhookDeliveryRepository(),
  newTarget: async () => ({
    partnerId: randomUUID(),
    studyId: randomUUID(),
    interviewId: randomUUID(),
  }),
}));
