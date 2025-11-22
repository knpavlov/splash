import { useEffect, useState, useRef } from 'react';
import styles from '../../../styles/InitiativeComments.module.css';
import { CommentSelectionTarget } from './types';

interface CommentSelectionOverlayProps {
  isActive: boolean;
  containerRef: React.RefObject<HTMLElement>;
  sidebarRef?: React.RefObject<HTMLElement>;
  onSelect: (target: CommentSelectionTarget) => void;
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
    return text.slice(0, 120);
  }
  return element.tagName.toLowerCase();
};

const buildDomPath = (element: HTMLElement): string => {
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
  onSelect
}: CommentSelectionOverlayProps) => {
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (sidebarRef?.current?.contains(event.target as Node)) return;
      if (!container.contains(event.target as Node)) return;

      // Don't prevent default to allow text selection
      setDragStart({ x: event.clientX, y: event.clientY });
      setDragCurrent({ x: event.clientX, y: event.clientY });
      isDragging.current = false;
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!dragStart) return;

      const dx = event.clientX - dragStart.x;
      const dy = event.clientY - dragStart.y;

      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isDragging.current = true;
      }

      setDragCurrent({ x: event.clientX, y: event.clientY });
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (!dragStart) return;

      const start = dragStart;
      const current = { x: event.clientX, y: event.clientY };
      const wasDragging = isDragging.current;

      setDragStart(null);
      setDragCurrent(null);
      isDragging.current = false;

      if (sidebarRef?.current?.contains(event.target as Node)) return;
      if (!container.contains(event.target as Node)) return;

      // 1. Check for text selection
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // Ensure selection is inside container
        if (
          rect.top >= containerRect.top &&
          rect.left >= containerRect.left &&
          rect.bottom <= containerRect.bottom &&
          rect.right <= containerRect.right
        ) {
          const targetElement = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
            ? range.commonAncestorContainer as HTMLElement
            : range.commonAncestorContainer.parentElement as HTMLElement;

          submitSelection(targetElement, rect, containerRect);
          return;
        }
      }

      // 2. Check for box selection (if dragged and no text selected)
      if (wasDragging) {
        const containerRect = container.getBoundingClientRect();
        const left = Math.min(start.x, current.x);
        const top = Math.min(start.y, current.y);
        const width = Math.abs(current.x - start.x);
        const height = Math.abs(current.y - start.y);

        if (width > 10 && height > 10) {
          // Find the element at the center of the box to use as anchor target
          const centerX = left + width / 2;
          const centerY = top + height / 2;
          const targetElement = (document.elementFromPoint(centerX, centerY) as HTMLElement) || container;

          const rect = { left, top, width, height, bottom: top + height, right: left + width } as DOMRect;
          submitSelection(targetElement, rect, containerRect);
          return;
        }
      }

      // 3. Fallback to click (element selection)
      if (!wasDragging) {
        const target = event.target as HTMLElement;
        const rect = target.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        submitSelection(target, rect, containerRect);
      }
    };

    const submitSelection = (target: HTMLElement, rect: DOMRect | { left: number, top: number, width: number, height: number }, containerRect: DOMRect) => {
      const anchor = target.closest<HTMLElement>('[data-comment-anchor]');
      const finalTarget = anchor ?? target;

      let selectionData;

      if (anchor) {
        const anchorRect = anchor.getBoundingClientRect();
        selectionData = {
          top: rect.top - anchorRect.top,
          left: rect.left - anchorRect.left,
          width: rect.width,
          height: rect.height,
          pageWidth: anchorRect.width, // Store anchor dimensions for scaling if needed
          pageHeight: anchorRect.height
        };
      } else {
        selectionData = {
          top: rect.top - containerRect.top,
          left: rect.left - containerRect.left,
          width: rect.width,
          height: rect.height,
          pageWidth: containerRect.width,
          pageHeight: containerRect.height
        };
      }

      const targetId =
        (anchor?.dataset.commentAnchor && anchor.dataset.commentAnchor.trim()) || buildDomPath(finalTarget);
      const targetLabel =
        (anchor?.dataset.commentLabel && anchor.dataset.commentLabel.trim()) || deriveLabel(finalTarget);
      const targetPath = buildDomPath(finalTarget);

      const popoverCoordinates = {
        top: rect.top - containerRect.top + rect.height + 10,
        left: rect.left - containerRect.left
      };

      onSelect({
        targetId,
        targetLabel,
        targetPath,
        selection: selectionData,
        popoverCoordinates
      });
    };

    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('mouseup', handleMouseUp, true);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [isActive, containerRef, sidebarRef, onSelect]);

  if (!isActive) {
    return null;
  }

  // Render drag overlay
  const renderDragBox = () => {
    if (!dragStart || !dragCurrent || !containerRef.current) return null;

    // Only show box if we are dragging and NO text is selected (simple heuristic)
    // Actually, checking selection live is hard. Let's just show it.
    // If text is selected, the blue highlight will appear too.

    const containerRect = containerRef.current.getBoundingClientRect();
    const left = Math.min(dragStart.x, dragCurrent.x) - containerRect.left;
    const top = Math.min(dragStart.y, dragCurrent.y) - containerRect.top;
    const width = Math.abs(dragCurrent.x - dragStart.x);
    const height = Math.abs(dragCurrent.y - dragStart.y);

    if (width < 5 && height < 5) return null;

    return (
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width,
          height,
          border: '2px dashed #3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          pointerEvents: 'none',
          zIndex: 100
        }}
      />
    );
  };

  return (
    <>
      <div className={styles.overlayNotice}>
        <p>Comment mode is active. Click, select text, or drag to comment.</p>
      </div>
      {renderDragBox()}
    </>
  );
};
