import { useEffect, useRef, useState } from 'react';
import styles from '../../../styles/InitiativeComments.module.css';
import { CommentSelectionTarget } from './types';

interface CommentSelectionOverlayProps {
  isActive: boolean;
  containerRef: React.RefObject<HTMLElement>;
  sidebarRef?: React.RefObject<HTMLElement>;
  onSelect: (target: CommentSelectionTarget) => void;
  onExit?: () => void;
}

const deriveLabel = (element: HTMLElement): string | null => {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) {
    return ariaLabel.trim();
  }
  const title = element.getAttribute('title');
  if (title && title.trim()) {
    return title.trim();
  }
  const text = element.textContent?.trim();
  if (text) {
    return text.slice(0, 160);
  }
  return element.tagName.toLowerCase();
};

const buildDomPath = (element: HTMLElement | null): string => {
  if (!element) {
    return 'body';
  }
  const segments: string[] = [];
  let current: HTMLElement | null = element;
  while (current && segments.length < 6 && current.tagName.toLowerCase() !== 'body') {
    const id = current.id ? `#${current.id}` : '';
    const className = current.className
      ? `.${current.className
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .join('.')}`
      : '';
    segments.unshift(`${current.tagName.toLowerCase()}${id || className}`);
    current = current.parentElement;
  }
  return segments.join(' > ') || element.tagName.toLowerCase();
};

export const CommentSelectionOverlay = ({
  isActive,
  containerRef,
  sidebarRef,
  onSelect,
  onExit
}: CommentSelectionOverlayProps) => {
  const dragRef = useRef<{
    startX: number;
    startY: number;
    target: HTMLElement | null;
    hasMoved: boolean;
    forceRegion: boolean;
  } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ top: number; left: number; width: number; height: number } | null>(
    null
  );

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const resetSelection = () => {
      dragRef.current = null;
      setSelectionBox(null);
    };

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const shouldIgnoreTarget = (target: HTMLElement | null) => {
      if (!target) {
        return false;
      }
      if (sidebarRef?.current && sidebarRef.current.contains(target)) {
        return true;
      }
      return Boolean(
        target.closest('[data-comment-popover]') ||
          target.closest('[data-comment-panel]') ||
          target.closest('[data-comment-highlight]')
      );
    };

    const normalizeBox = (rect: DOMRect, host: DOMRect) => {
      const scrollTop = container.scrollTop;
      const scrollLeft = container.scrollLeft;
      const pageWidth = container.scrollWidth || host.width;
      const pageHeight = container.scrollHeight || host.height;
      return {
        top: rect.top - host.top + scrollTop,
        left: rect.left - host.left + scrollLeft,
        width: rect.width,
        height: rect.height,
        pageWidth,
        pageHeight
      };
    };

    const handleTextSelection = (hostRect: DOMRect): CommentSelectionTarget | null => {
      const selection = window.getSelection?.();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return null;
      }
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) {
        return null;
      }
      const intersects =
        rect.bottom >= hostRect.top &&
        rect.top <= hostRect.bottom &&
        rect.right >= hostRect.left &&
        rect.left <= hostRect.right;
      if (!intersects) {
        return null;
      }
      const rawElement =
        (range.commonAncestorContainer as HTMLElement | null) ?? range.startContainer?.parentElement ?? null;
      const anchor = rawElement?.closest<HTMLElement>('[data-comment-anchor]');
      const target = anchor ?? rawElement ?? container;
      const targetId = (anchor?.dataset.commentAnchor && anchor.dataset.commentAnchor.trim()) || buildDomPath(target);
      const labelFromSelection = selection.toString().trim().slice(0, 160);
      const targetLabel =
        (anchor?.dataset.commentLabel && anchor.dataset.commentLabel.trim()) ||
        labelFromSelection ||
        deriveLabel(target);
      const targetPath = buildDomPath(target);
      const box = normalizeBox(rect, hostRect);
      return {
        targetId,
        targetLabel,
        targetPath,
        selection: box,
        mode: 'element',
        cursor: {
          x: Math.min(Math.max(box.left + box.width / 2, 0), hostRect.width),
          y: Math.min(box.top + box.height, hostRect.height)
        }
      };
    };

    const buildTargetFromElement = (hostRect: DOMRect, rawTarget: HTMLElement | null): CommentSelectionTarget | null => {
      if (!rawTarget) {
        return null;
      }
      const anchor = rawTarget.closest<HTMLElement>('[data-comment-anchor]');
      const target = anchor ?? rawTarget;
      const rect = target.getBoundingClientRect();
      if (!rect) {
        return null;
      }
      const box = normalizeBox(rect, hostRect);
      const targetId =
        (anchor?.dataset.commentAnchor && anchor.dataset.commentAnchor.trim()) || buildDomPath(target);
      const targetLabel =
        (anchor?.dataset.commentLabel && anchor.dataset.commentLabel.trim()) ||
        deriveLabel(target) ||
        deriveLabel(container);
      const targetPath = buildDomPath(target);
      return {
        targetId,
        targetLabel,
        targetPath,
        selection: box,
        mode: anchor ? 'element' : 'region',
        cursor: {
          x: Math.min(Math.max(box.left + box.width / 2, 0), hostRect.width),
          y: Math.min(box.top + box.height, hostRect.height)
        }
      };
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (shouldIgnoreTarget(target)) {
        return;
      }
      if (!container.contains(target)) {
        return;
      }
      if (event.button !== 0) {
        return;
      }
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        target,
        hasMoved: false,
        forceRegion: event.altKey
      };
      setSelectionBox(null);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = dragRef.current;
      if (!state) {
        return;
      }
      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 6) {
        state.hasMoved = true;
      }
      if (!state.hasMoved) {
        return;
      }
      const hostRect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const scrollTop = container.scrollTop;
      const left = Math.min(state.startX, event.clientX) - hostRect.left + scrollLeft;
      const top = Math.min(state.startY, event.clientY) - hostRect.top + scrollTop;
      const width = Math.max(Math.abs(deltaX), 8);
      const height = Math.max(Math.abs(deltaY), 8);
      setSelectionBox({
        top,
        left,
        width,
        height
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (shouldIgnoreTarget(event.target as HTMLElement | null)) {
        resetSelection();
        return;
      }
      const hostRect = container.getBoundingClientRect();
      const targetFromText = handleTextSelection(hostRect);
      if (targetFromText) {
        event.preventDefault();
        event.stopPropagation();
        onSelect(targetFromText);
        resetSelection();
        return;
      }

      const state = dragRef.current;
      if (state?.hasMoved) {
        event.preventDefault();
        event.stopPropagation();
        const left = Math.min(state.startX, event.clientX);
        const top = Math.min(state.startY, event.clientY);
        const width = Math.max(Math.abs(event.clientX - state.startX), 12);
        const height = Math.max(Math.abs(event.clientY - state.startY), 12);
        const box = normalizeBox(new DOMRect(left, top, width, height), hostRect);
        const anchor = state.forceRegion
          ? null
          : (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-comment-anchor]') ?? state.target;
        const fallbackLabel = deriveLabel(anchor ?? container);
        const targetId =
          (anchor?.dataset.commentAnchor && anchor.dataset.commentAnchor.trim()) ||
          buildDomPath(anchor ?? container) ||
          `region-${Date.now()}`;
        const targetLabel =
          (anchor?.dataset.commentLabel && anchor.dataset.commentLabel.trim()) || (state.forceRegion ? 'Selected area' : fallbackLabel);
        onSelect({
          targetId,
          targetLabel,
          targetPath: buildDomPath(anchor ?? container),
          selection: box,
          mode: anchor ? 'element' : 'region',
          cursor: {
            x: Math.min(Math.max(box.left + box.width / 2, 0), hostRect.width),
            y: Math.min(box.top + box.height, hostRect.height)
          }
        });
        resetSelection();
        return;
      }

      const targetFromClick = buildTargetFromElement(
        hostRect,
        (event.target as HTMLElement | null) ?? state?.target ?? null
      );
      if (targetFromClick) {
        event.preventDefault();
        event.stopPropagation();
        onSelect(targetFromClick);
      }
      resetSelection();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        resetSelection();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointermove', handlePointerMove, true);
    document.addEventListener('pointerup', handlePointerUp, true);
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointermove', handlePointerMove, true);
      document.removeEventListener('pointerup', handlePointerUp, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [containerRef, sidebarRef, isActive, onSelect]);

  if (!isActive) {
    return null;
  }

  return (
    <>
      <div className={styles.overlayNotice}>
        <p>
          Select text or drag to mark an area. Hold Alt while dragging to save a free region. A comment box will appear near your cursor.
        </p>
        {onExit && (
          <button className={styles.overlayExit} type="button" onClick={onExit}>
            Exit comment mode
          </button>
        )}
      </div>
      {selectionBox && (
        <div
          className={styles.selectionGhost}
          style={{
            top: selectionBox.top,
            left: selectionBox.left,
            width: selectionBox.width,
            height: selectionBox.height
          }}
        />
      )}
    </>
  );
};
