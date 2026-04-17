// Probe file — verifies cody-shared imports work in this repo.
// Does not affect runtime behavior.
import { tokens } from 'cody-shared';
import type { Organization, CodyConversation } from 'cody-shared';

export const SHARED_PROBE = {
  tokensLoaded: typeof tokens !== 'undefined',
  primaryColor: tokens.color.primary,
};

// Type-level proof these imports compile:
export type _OrgCheck = Organization;
export type _ConvoCheck = CodyConversation;
