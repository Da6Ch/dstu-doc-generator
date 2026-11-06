// lib/llm/prompts/index.ts

import type { DstuStandardId } from "@/lib/types";
import { buildDstu19201Prompt } from "./dstu19201";
import { buildDstu19402Prompt } from "./dstu19402";
import { buildDstu19404Prompt } from "./dstu19404";
import { buildDstu19505Prompt } from "./dstu19505";

export interface PromptBuilderParams {
  owner: string;
  repo: string;
  digest: string;
  readme?: string;
}

export const PROMPT_BUILDERS: Record<
  DstuStandardId,
  (params: PromptBuilderParams) => string
> = {
  "dstu-19201": buildDstu19201Prompt,
  "dstu-19402": buildDstu19402Prompt,
  "dstu-19404": buildDstu19404Prompt,
  "dstu-19505": buildDstu19505Prompt,
};
