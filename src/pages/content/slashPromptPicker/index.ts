import browser from 'webextension-polyfill';

import { promptStorageService } from '@/core/services/StorageService';
import { StorageKeys } from '@/core/types/common';

type PromptItem = {
  id: string;
  text: string;
  tags: string[];
  createdAt: number;
  updatedAt?: number;
};

type SlashTokenRange = {
  start: number;
  end: number;
  query: string;
};

type EditableTarget = HTMLElement | HTMLTextAreaElement;

type EditableState = {
  text: string;
  caret: number;
};

type ReplaceTextResult = {
  text: string;
  caret: number;
};

const MENU_CLASS = 'gv-spp-menu';
const MENU_VISIBLE_CLASS = 'gv-spp-visible';
const MENU_ITEM_ACTIVE_CLASS = 'gv-spp-item-active';
const STYLE_ID = 'gv-spp-style';
const PROMPT_LIMIT = 8;

const INPUT_SELECTORS = [
  'rich-textarea [contenteditable="true"]',
  'div[contenteditable="true"][role="textbox"]',
  'textarea',
].join(', ');

export function parseSlashToken(text: string, caret: number): SlashTokenRange | null {
  if (!Number.isFinite(caret) || caret < 0 || caret > text.length) return null;
  const beforeCaret = text.slice(0, caret);
  const slashIndex = beforeCaret.lastIndexOf('/');
  if (slashIndex < 0) return null;

  const charBeforeSlash = slashIndex === 0 ? ' ' : beforeCaret.charAt(slashIndex - 1);
  if (!/\s/.test(charBeforeSlash)) return null;

  const query = beforeCaret.slice(slashIndex + 1);
  if (/\s/.test(query)) return null;

  return { start: slashIndex, end: caret, query };
}

export function replaceTextRange(
  text: string,
  start: number,
  end: number,
  replacement: string,
): ReplaceTextResult {
  const nextText = `${text.slice(0, start)}${replacement}${text.slice(end)}`;
  return {
    text: nextText,
    caret: start + replacement.length,
  };
}

export function filterPromptItems(items: PromptItem[], query: string, limit = PROMPT_LIMIT): PromptItem[] {
  const normalized = query.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (!item.text) return false;
    if (!normalized) return true;
    if (item.text.toLowerCase().includes(normalized)) return true;
    return item.tags.some((tag) => tag.toLowerCase().includes(normalized));
  });
  return filtered.slice(0, limit);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isEditableElement(element: Element | null): element is EditableTarget {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (!(element instanceof HTMLElement)) return false;
  return element.isContentEditable || element.getAttribute('contenteditable') === 'true';
}

function findEditableFromTarget(target: EventTarget | null): EditableTarget | null {
  if (!(target instanceof Element)) return null;
  const editable = target.closest(INPUT_SELECTORS);
  if (isEditableElement(editable)) return editable;
  return null;
}

function getContentEditableCaretOffset(root: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.endContainer)) return null;

  const cloned = range.cloneRange();
  cloned.selectNodeContents(root);
  cloned.setEnd(range.endContainer, range.endOffset);
  return cloned.toString().length;
}

function setContentEditableCaretOffset(root: HTMLElement, offset: number): void {
  const safeOffset = Math.max(0, offset);
  const selection = window.getSelection();
  if (!selection) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  let remaining = safeOffset;

  while (node) {
    const textNode = node as Text;
    if (remaining <= textNode.length) {
      const range = document.createRange();
      range.setStart(textNode, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= textNode.length;
    node = walker.nextNode();
  }

  if (!root.firstChild) {
    root.appendChild(document.createTextNode(''));
  }
  const fallbackRange = document.createRange();
  fallbackRange.selectNodeContents(root);
  fallbackRange.collapse(false);
  selection.removeAllRanges();
  selection.addRange(fallbackRange);
}

function getEditableState(editable: EditableTarget): EditableState | null {
  if (editable instanceof HTMLTextAreaElement) {
    const caret = typeof editable.selectionStart === 'number' ? editable.selectionStart : 0;
    return {
      text: editable.value ?? '',
      caret,
    };
  }

  const caret = getContentEditableCaretOffset(editable);
  if (caret === null) return null;
  return {
    text: editable.textContent ?? '',
    caret,
  };
}

function replaceRangeInEditable(
  editable: EditableTarget,
  token: SlashTokenRange,
  replacement: string,
): void {
  const state = getEditableState(editable);
  if (!state) return;
  const next = replaceTextRange(state.text, token.start, token.end, replacement);

  if (editable instanceof HTMLTextAreaElement) {
    editable.value = next.text;
    editable.selectionStart = editable.selectionEnd = next.caret;
    editable.dispatchEvent(new Event('input', { bubbles: true }));
    editable.focus();
    return;
  }

  editable.textContent = next.text;
  setContentEditableCaretOffset(editable, next.caret);
  editable.dispatchEvent(new Event('input', { bubbles: true }));
  editable.focus();
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${MENU_CLASS} {
      position: fixed;
      z-index: 2147483000;
      width: 360px;
      max-height: 300px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      background: rgba(23, 23, 23, 0.96);
      color: #f5f5f5;
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.35);
      display: none;
      backdrop-filter: blur(8px);
    }
    .${MENU_CLASS}.${MENU_VISIBLE_CLASS} {
      display: block;
    }
    .gv-spp-list {
      margin: 0;
      padding: 6px;
      list-style: none;
      max-height: 300px;
      overflow: auto;
    }
    .gv-spp-item {
      width: 100%;
      display: block;
      border: 0;
      background: transparent;
      color: inherit;
      text-align: left;
      border-radius: 8px;
      padding: 8px 10px;
      cursor: pointer;
    }
    .gv-spp-item:hover,
    .gv-spp-item.${MENU_ITEM_ACTIVE_CLASS} {
      background: rgba(255, 255, 255, 0.12);
    }
    .gv-spp-item-text {
      font-size: 13px;
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
    }
    .gv-spp-item-tags {
      margin-top: 6px;
      font-size: 11px;
      opacity: 0.75;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .gv-spp-empty {
      padding: 10px 12px;
      font-size: 12px;
      opacity: 0.75;
    }
  `;
  document.head.appendChild(style);
}

async function loadPromptItems(): Promise<PromptItem[]> {
  const result = await promptStorageService.get<PromptItem[]>(StorageKeys.PROMPT_ITEMS);
  if (!result.success || !Array.isArray(result.data)) return [];

  return result.data.filter(
    (item) =>
      item &&
      typeof item.text === 'string' &&
      item.text.trim().length > 0 &&
      Array.isArray(item.tags),
  );
}

function isGeminiWebPage(hostname: string = window.location.hostname): boolean {
  const host = hostname.toLowerCase();
  return host === 'gemini.google.com' || host.includes('business.gemini.google');
}

export function startSlashPromptPicker(): { destroy: () => void } {
  if (!isGeminiWebPage()) return { destroy: () => {} };
  if (document.querySelector(`.${MENU_CLASS}`)) return { destroy: () => {} };

  injectStyles();

  const menu = document.createElement('div');
  menu.className = MENU_CLASS;
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', 'Prompt suggestions');

  const list = document.createElement('ul');
  list.className = 'gv-spp-list';
  menu.appendChild(list);
  document.body.appendChild(menu);

  let items: PromptItem[] = [];
  let filteredItems: PromptItem[] = [];
  let selectedIndex = 0;
  let open = false;
  let activeEditable: EditableTarget | null = null;
  let activeToken: SlashTokenRange | null = null;

  const renderList = (): void => {
    list.innerHTML = '';
    if (!filteredItems.length) {
      const empty = document.createElement('div');
      empty.className = 'gv-spp-empty';
      empty.textContent = 'No preset prompts found';
      list.appendChild(empty);
      return;
    }

    filteredItems.forEach((item, index) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gv-spp-item';
      if (index === selectedIndex) {
        button.classList.add(MENU_ITEM_ACTIVE_CLASS);
      }
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', index === selectedIndex ? 'true' : 'false');
      button.setAttribute('data-index', String(index));

      const text = document.createElement('div');
      text.className = 'gv-spp-item-text';
      text.textContent = item.text;
      button.appendChild(text);

      if (item.tags.length) {
        const tags = document.createElement('div');
        tags.className = 'gv-spp-item-tags';
        tags.textContent = item.tags.join(' · ');
        button.appendChild(tags);
      }

      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        applySelectedPrompt(index);
      });

      li.appendChild(button);
      list.appendChild(li);
    });
  };

  const positionMenu = (): void => {
    if (!activeEditable) return;
    const rect = activeEditable.getBoundingClientRect();
    const width = clamp(Math.round(Math.max(300, Math.min(440, rect.width))), 280, window.innerWidth - 16);
    menu.style.width = `${width}px`;

    const left = clamp(Math.round(rect.left), 8, Math.max(8, window.innerWidth - width - 8));
    menu.style.left = `${left}px`;

    const menuHeight = menu.offsetHeight || 260;
    let top = rect.top - menuHeight - 8;
    if (top < 8) {
      top = rect.bottom + 8;
    }
    top = clamp(Math.round(top), 8, Math.max(8, window.innerHeight - menuHeight - 8));
    menu.style.top = `${top}px`;
  };

  const closeMenu = (): void => {
    open = false;
    activeToken = null;
    menu.classList.remove(MENU_VISIBLE_CLASS);
  };

  const openMenu = (): void => {
    if (!activeEditable || !activeToken) return;
    open = true;
    menu.classList.add(MENU_VISIBLE_CLASS);
    renderList();
    positionMenu();
  };

  const updateForEditable = (editable: EditableTarget): void => {
    const state = getEditableState(editable);
    if (!state) {
      closeMenu();
      return;
    }

    const token = parseSlashToken(state.text, state.caret);
    if (!token) {
      closeMenu();
      return;
    }

    activeEditable = editable;
    activeToken = token;
    filteredItems = filterPromptItems(items, token.query);
    selectedIndex = filteredItems.length ? 0 : -1;
    openMenu();
  };

  const applySelectedPrompt = (index: number): void => {
    if (!activeEditable || !activeToken) return;
    const selected = filteredItems[index];
    if (!selected) return;
    replaceRangeInEditable(activeEditable, activeToken, selected.text);
    closeMenu();
  };

  const onInput = (event: Event): void => {
    const editable = findEditableFromTarget(event.target);
    if (!editable) {
      if (open) closeMenu();
      return;
    }
    updateForEditable(editable);
  };

  const onKeyDownCapture = (event: KeyboardEvent): void => {
    if (!open) return;
    if (event.isComposing) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      if (!filteredItems.length) return;
      selectedIndex = (selectedIndex + 1) % filteredItems.length;
      renderList();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      if (!filteredItems.length) return;
      selectedIndex = (selectedIndex - 1 + filteredItems.length) % filteredItems.length;
      renderList();
      return;
    }

    if (
      event.key === 'Enter' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey
    ) {
      if (selectedIndex < 0 || !filteredItems.length) return;
      event.preventDefault();
      event.stopPropagation();
      applySelectedPrompt(selectedIndex);
      return;
    }

    if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (selectedIndex < 0 || !filteredItems.length) return;
      event.preventDefault();
      event.stopPropagation();
      applySelectedPrompt(selectedIndex);
    }
  };

  const onPointerDownCapture = (event: PointerEvent): void => {
    if (!open) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(`.${MENU_CLASS}`)) return;
    if (activeEditable && target.closest(INPUT_SELECTORS) === activeEditable) return;
    closeMenu();
  };

  const onViewportChanged = (): void => {
    if (!open) return;
    positionMenu();
  };

  const storageChangeHandler = (
    changes: Record<string, browser.Storage.StorageChange>,
    area: string,
  ): void => {
    if (area !== 'local' || !changes?.[StorageKeys.PROMPT_ITEMS]) return;
    const next = changes[StorageKeys.PROMPT_ITEMS].newValue;
    if (!Array.isArray(next)) {
      items = [];
    } else {
      items = next.filter(
        (item) =>
          item &&
          typeof item.text === 'string' &&
          item.text.trim().length > 0 &&
          Array.isArray(item.tags),
      );
    }
    if (open && activeEditable) {
      updateForEditable(activeEditable);
    }
  };

  void loadPromptItems().then((loaded) => {
    items = loaded;
  });

  window.addEventListener('input', onInput, { capture: true });
  window.addEventListener('keydown', onKeyDownCapture, { capture: true });
  window.addEventListener('pointerdown', onPointerDownCapture, { capture: true });
  window.addEventListener('resize', onViewportChanged, { passive: true });
  window.addEventListener('scroll', onViewportChanged, { passive: true });
  try {
    browser.storage.onChanged.addListener(storageChangeHandler);
  } catch {
    // no-op
  }

  return {
    destroy: () => {
      closeMenu();
      window.removeEventListener('input', onInput, { capture: true });
      window.removeEventListener('keydown', onKeyDownCapture, { capture: true });
      window.removeEventListener('pointerdown', onPointerDownCapture, { capture: true });
      window.removeEventListener('resize', onViewportChanged);
      window.removeEventListener('scroll', onViewportChanged);
      try {
        browser.storage.onChanged.removeListener(storageChangeHandler);
      } catch {
        // no-op
      }
      menu.remove();
      document.getElementById(STYLE_ID)?.remove();
    },
  };
}

