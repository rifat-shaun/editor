import type { JSONContent } from '../src/types';

const p = (text: string): JSONContent => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

const h = (level: number, text: string): JSONContent => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
});

/**
 * Sample mutual NDA. Phrases in §1–§4 are deliberately imperfect so the mock
 * AI provider has real text to redline (see mockAiProvider.ts).
 */
export const ndaContent: JSONContent = {
  type: 'doc',
  content: [
    h(1, 'Mutual Non-Disclosure Agreement'),
    {
      type: 'paragraph',
      attrs: { textAlign: 'center' },
      content: [
        {
          type: 'text',
          text: 'This Agreement is entered into as of the Effective Date by and between the parties identified below.',
        },
      ],
    },

    h(2, '1. Definitions'),
    p('For the purposes of this Agreement, the following terms shall have the meanings set forth below.'),
    h(3, '1.1 Confidential Information'),
    p(
      'Confidential Information means any and all information that is disclosed by one party to the other party which is of a confidential nature, including but not limited to business plans, financial data, and technical specifications.',
    ),
    h(3, '1.2 Representatives'),
    p(
      'Representatives means, with respect to a party, its employees, officers, directors, and professional advisors who need to know such information.',
    ),

    h(2, '2. Confidentiality Obligations'),
    h(4, '2.1 Duty of Care'),
    p(
      'The receiving party will try to keep the disclosing party’s Confidential Information secret and will not really share it with anybody else unless they say it is okay.',
    ),
    h(4, '2.2 Permitted Disclosures'),
    p(
      'Notwithstanding the foregoing, the receiving party may disclose Confidential Information to its Representatives on a need-to-know basis, provided such Representatives are bound by confidentiality obligations no less restrictive than those set forth herein.',
    ),

    h(2, '3. Term and Termination'),
    p(
      'This Agreement will start on the Effective Date and it is going to continue for a period of two (2) years, after which time it will automatically end unless the parties agree in writing to keep it going for longer.',
    ),
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [p('Either party may terminate upon thirty (30) days written notice.')],
        },
        {
          type: 'listItem',
          content: [p('Obligations of confidentiality survive termination for three (3) years.')],
        },
      ],
    },

    h(2, '4. General Provisions'),
    h(4, '4.1 Entire Agreement'),
    p(
      'This Agreement constitutes the entire understanding between the parties with respect to its subject matter and supersedes all prior discussions.',
    ),
    h(4, '4.2 Governing Law'),
    p('This Agreement shall be governed by applicable law.'),
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Signature blocks follow on the next page.' }],
    },
  ],
};
