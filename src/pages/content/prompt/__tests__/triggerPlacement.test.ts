import { afterEach, describe, expect, it } from 'vitest';

import {
  applyFloatingTriggerPosition,
  createTopbarPlacementObserver,
  isGeminiWebTopbarMode,
  placePromptTriggerInTopbar,
} from '../index';

describe('prompt trigger topbar placement', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('inserts trigger before share button on Gemini top bar', () => {
    const topbar = document.createElement('div');
    const trigger = document.createElement('button');
    const share = document.createElement('button');
    share.setAttribute('data-test-id', 'share-button');
    topbar.appendChild(share);
    document.body.appendChild(topbar);
    document.body.appendChild(trigger);

    const placed = placePromptTriggerInTopbar(trigger, document);

    expect(placed).toBe(true);
    expect(topbar.firstElementChild).toBe(trigger);
    expect(trigger.nextElementSibling).toBe(share);
    expect(trigger.classList.contains('gv-pm-trigger-inline')).toBe(true);
  });

  it('uses Gemini title row instead of generic actions-menu buttons on homepage', () => {
    const sidebar = document.createElement('div');
    const actions = document.createElement('button');
    actions.setAttribute('data-test-id', 'actions-menu-button');
    sidebar.appendChild(actions);
    document.body.appendChild(sidebar);

    const topbar = document.createElement('div');
    const title = document.createElement('h1');
    title.textContent = 'Gemini';
    topbar.appendChild(title);
    document.body.appendChild(topbar);

    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    const placed = placePromptTriggerInTopbar(trigger, document);

    expect(placed).toBe(true);
    expect(title.nextElementSibling).toBe(trigger);
    expect(trigger.classList.contains('gv-pm-trigger-title-inline')).toBe(true);
  });

  it('falls back to Gemini title row when action buttons are not available', () => {
    const topbar = document.createElement('div');
    const title = document.createElement('h1');
    title.textContent = 'Gemini';
    topbar.appendChild(title);
    document.body.appendChild(topbar);

    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    const placed = placePromptTriggerInTopbar(trigger, document);

    expect(placed).toBe(true);
    expect(title.nextElementSibling).toBe(trigger);
    expect(trigger.classList.contains('gv-pm-trigger-inline')).toBe(true);
    expect(trigger.classList.contains('gv-pm-trigger-title-inline')).toBe(true);
  });

  it('prefers share button placement when both share and title exist', () => {
    const topbar = document.createElement('div');
    const title = document.createElement('h1');
    title.textContent = 'Gemini';
    const share = document.createElement('button');
    share.setAttribute('data-test-id', 'share-button');
    topbar.appendChild(title);
    topbar.appendChild(share);
    document.body.appendChild(topbar);

    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    const placed = placePromptTriggerInTopbar(trigger, document);

    expect(placed).toBe(true);
    expect(trigger.nextElementSibling).toBe(share);
    expect(trigger.classList.contains('gv-pm-trigger-title-inline')).toBe(false);
  });

  it('returns false when only generic actions-menu button exists', () => {
    const actions = document.createElement('button');
    actions.setAttribute('data-test-id', 'actions-menu-button');
    document.body.appendChild(actions);

    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    expect(placePromptTriggerInTopbar(trigger, document)).toBe(false);
    expect(trigger.parentElement).toBe(document.body);
  });

  it('returns false if no anchor button exists', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    expect(placePromptTriggerInTopbar(trigger, document)).toBe(false);
    expect(trigger.parentElement).toBe(document.body);
  });

  it('detects Gemini hostname correctly', () => {
    expect(isGeminiWebTopbarMode('gemini.google.com')).toBe(true);
    expect(isGeminiWebTopbarMode('aistudio.google.com')).toBe(false);
    expect(isGeminiWebTopbarMode('example.com')).toBe(false);
  });

  it('creates mutation observer only when topbar mode is enabled', () => {
    const callback: MutationCallback = () => {};
    const observer = createTopbarPlacementObserver(true, callback);
    const disabledObserver = createTopbarPlacementObserver(false, callback);

    expect(observer).toBeInstanceOf(MutationObserver);
    expect(disabledObserver).toBeNull();

    observer?.disconnect();
  });

  it('restores floating trigger position from saved values', () => {
    const trigger = document.createElement('button');

    const applied = applyFloatingTriggerPosition(trigger, { right: 42.6, bottom: 88.2 });

    expect(applied).toBe(true);
    expect(trigger.style.right).toBe('43px');
    expect(trigger.style.bottom).toBe('88px');
  });

  it('ignores invalid saved floating trigger position', () => {
    const trigger = document.createElement('button');
    trigger.style.right = '18px';
    trigger.style.bottom = '18px';

    const applied = applyFloatingTriggerPosition(trigger, { right: Number.NaN, bottom: 12 });

    expect(applied).toBe(false);
    expect(trigger.style.right).toBe('18px');
    expect(trigger.style.bottom).toBe('18px');
  });
});
