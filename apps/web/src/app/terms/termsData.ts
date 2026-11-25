import { TERMS_PART1, type TermsSection } from './termsDataPart1';
import { TERMS_PART2 } from './termsDataPart2';

export type { TermsSection };
export const TERMS_SECTIONS: TermsSection[] = [...TERMS_PART1, ...TERMS_PART2];
