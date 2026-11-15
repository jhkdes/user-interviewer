import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { parse } from "yaml";

/**
 * Checks values against src/partner-api/openapi.yaml, so the published
 * description and the code cannot drift apart without a test failing.
 */
const document = parse(
  readFileSync(join(process.cwd(), "src", "partner-api", "openapi.yaml"), "utf8"),
);

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(document, "api");

export const openApiDocument = document as {
  paths: Record<string, unknown>;
  components: { schemas: Record<string, unknown> };
};

/** Fails with every mismatch if `value` is not what the named schema describes. */
export function schemaProblems(name: string, value: unknown): string[] {
  const validate = ajv.getSchema(`api#/components/schemas/${name}`);
  if (!validate) throw new Error(`openapi.yaml has no schema named ${name}`);
  return validate(value)
    ? []
    : (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`);
}
