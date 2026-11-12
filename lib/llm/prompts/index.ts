// lib/llm/prompts/index.ts

import type { DocStandardId } from "@/lib/types";
import type { PromptBuilderParams } from "./common";
import { buildIso29148Prompt } from "./iso29148";
import { buildIso42010Prompt } from "./iso42010";
import { buildIso26514Prompt } from "./iso26514";
import { buildEspd19404Prompt } from "./espd19404";

export type { PromptBuilderParams };

export const PROMPT_BUILDERS: Record<
  DocStandardId,
  (params: PromptBuilderParams) => string
> = {
  "iso-29148": buildIso29148Prompt,
  "iso-42010": buildIso42010Prompt,
  "iso-26514": buildIso26514Prompt,
  "espd-19404": buildEspd19404Prompt,
};
