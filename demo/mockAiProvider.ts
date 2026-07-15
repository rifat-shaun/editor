import { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { buildExtensions } from '../src/editor/extensionsList';
import type { AiProvider, JSONContent, ProposedChange } from '../src/types';
import { ndaContent } from './ndaContent';

/** Find the [from, to] of a phrase living inside a single text node. */
function locate(doc: PMNode, phrase: string): { from: number; to: number } | null {
  let hit: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (hit) return false;
    if (node.isText && node.text) {
      const idx = node.text.indexOf(phrase);
      if (idx >= 0) hit = { from: pos + idx, to: pos + idx + phrase.length };
    }
    return true;
  });
  return hit;
}

interface Spec {
  id: string;
  sectionRef: string;
  rationale: string;
  find: string;
  deletion?: string;
  insertion?: string;
  /** For pure insertions: 'end' anchors after the found phrase. */
  at?: 'end';
}

const SPECS: Spec[] = [
  {
    id: 'ch1',
    sectionRef: '§1.1',
    rationale: 'Tighten the definition — the original is wordy and repeats “party”.',
    find: 'any and all information that is disclosed by one party to the other party which is of a confidential nature',
    deletion:
      'any and all information that is disclosed by one party to the other party which is of a confidential nature',
    insertion: 'information disclosed between the parties that is confidential in nature',
  },
  {
    id: 'ch2',
    sectionRef: '§2.1',
    rationale: 'Replace colloquial language with enforceable contractual wording.',
    find: 'The receiving party will try to keep the disclosing party’s Confidential Information secret and will not really share it with anybody else unless they say it is okay.',
    deletion:
      'The receiving party will try to keep the disclosing party’s Confidential Information secret and will not really share it with anybody else unless they say it is okay.',
    insertion:
      'The receiving party shall hold the disclosing party’s Confidential Information in strict confidence and shall not disclose it to any third party without the disclosing party’s prior written consent.',
  },
  {
    id: 'ch3',
    sectionRef: '§3',
    rationale: 'Fix grammar and use operative legal verbs (“shall”) for the term clause.',
    find: 'will start on the Effective Date and it is going to continue for a period of two (2) years, after which time it will automatically end unless the parties agree in writing to keep it going for longer',
    deletion:
      'will start on the Effective Date and it is going to continue for a period of two (2) years, after which time it will automatically end unless the parties agree in writing to keep it going for longer',
    insertion:
      'shall commence on the Effective Date and continue for a period of two (2) years, after which it shall automatically terminate unless the parties agree in writing to extend it',
  },
  {
    id: 'ch4',
    sectionRef: '§4.2',
    rationale: 'Add a jurisdiction sentence — governing law alone leaves venue undefined.',
    find: 'This Agreement shall be governed by applicable law.',
    at: 'end',
    insertion:
      ' Any dispute arising hereunder shall be subject to the exclusive jurisdiction of the competent courts.',
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Demo provider. Resolves canned edits to real ProseMirror positions using a
 * headless editor built from the identical schema, then streams them back with
 * artificial latency to exercise the generating → reviewing flow.
 */
export function createMockAiProvider(content: JSONContent = ndaContent): AiProvider {
  let resolved: ProposedChange[] | null = null;

  const resolve = (): ProposedChange[] => {
    if (resolved) return resolved;
    const headless = new Editor({ extensions: buildExtensions(), content });
    const doc = headless.state.doc;
    const out: ProposedChange[] = [];
    for (const s of SPECS) {
      const range = locate(doc, s.find);
      if (!range) continue;
      const anchor = s.at === 'end' ? { from: range.to, to: range.to } : range;
      out.push({
        id: s.id,
        anchor,
        deletion: s.deletion,
        insertion: s.insertion,
        rationale: s.rationale,
        sectionRef: s.sectionRef,
      });
    }
    headless.destroy();
    resolved = out;
    return out;
  };

  return {
    async *proposeEdits() {
      const changes = resolve();
      for (const change of changes) {
        await sleep(750);
        yield change;
      }
    },
  };
}
