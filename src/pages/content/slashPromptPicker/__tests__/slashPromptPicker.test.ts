import { describe, expect, it } from 'vitest';

import { filterPromptItems, parseSlashToken, replaceTextRange } from '../index';

describe('slashPromptPicker helpers', () => {
  it('detects slash token at beginning of input', () => {
    expect(parseSlashToken('/summarize', '/summarize'.length)).toEqual({
      start: 0,
      end: 10,
      query: 'summarize',
    });
  });

  it('detects slash token after whitespace', () => {
    const text = 'Please /translate';
    expect(parseSlashToken(text, text.length)).toEqual({
      start: 7,
      end: 17,
      query: 'translate',
    });
  });

  it('ignores slash tokens inside normal words or urls', () => {
    expect(parseSlashToken('https://gemini.google.com', 24)).toBeNull();
    expect(parseSlashToken('abc/def', 7)).toBeNull();
  });

  it('stops matching when token already contains whitespace', () => {
    const text = '/summarize this';
    expect(parseSlashToken(text, text.length)).toBeNull();
  });

  it('filters prompts by text and tags', () => {
    const prompts = [
      { id: '1', text: 'Summarize this page', tags: ['summary'], createdAt: 1 },
      { id: '2', text: 'Translate to Chinese', tags: ['translate', 'zh'], createdAt: 2 },
      { id: '3', text: 'Generate test cases', tags: ['testing'], createdAt: 3 },
    ];

    expect(filterPromptItems(prompts, '')).toHaveLength(3);
    expect(filterPromptItems(prompts, 'trans').map((item) => item.id)).toEqual(['2']);
    expect(filterPromptItems(prompts, 'testing').map((item) => item.id)).toEqual(['3']);
  });

  it('replaces command token with selected prompt text', () => {
    const text = 'Please /sum now';
    const next = replaceTextRange(text, 7, 11, 'Summarize this');
    expect(next.text).toBe('Please Summarize this now');
    expect(next.caret).toBe(21);
  });
});

