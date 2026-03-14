/**
 * ANIMA Context Automanagement
 *
 * Fixed 120K token context with intelligent allocation:
 * - 20K identity & memory (who am I, what do I know)
 * - 50K user prompts & instructions (back of mind)
 * - 50K working memory (current conversation)
 */

export {
  ContextManager,
  type ContextZone,
  type ContextBlock,
  type ContextBudget,
  type ContextPacket,
  estimateTokens,
  MAX_CONTEXT_TOKENS,
  IDENTITY_ZONE_TOKENS,
  PROMPT_ZONE_TOKENS,
  WORKING_ZONE_TOKENS,
} from "./manager.js";
