import { useEffect } from 'react';
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
  useEffect(() => {
    if (!isActive) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const sidebar = sidebarRef?.current;
      if (sidebar && sidebar.contains(event.target as Node)) {
        return;
      }
      if (!container.contains(event.target as Node)) {
        return;
      }
      const rawTarget = (event.target as HTMLElement) ?? null;
      const anchor = rawTarget?.closest<HTMLElement>('[data-comment-anchor]');
      const target = anchor ?? rawTarget;
      if (!target) {
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      event.preventDefault();
      event.stopPropagation();
      const selection = {
        top: targetRect.top - containerRect.top,
        left: targetRect.left - containerRect.left,
        width: targetRect.width,
        height: targetRect.height,
        pageWidth: containerRect.width,
        pageHeight: containerRect.height
      };
      const targetId =
        (anchor?.dataset.commentAnchor && anchor.dataset.commentAnchor.trim()) || buildDomPath(target);
      const targetLabel =
        (anchor?.dataset.commentLabel && anchor.dataset.commentLabel.trim()) || deriveLabel(target);
      const targetPath = buildDomPath(target);
      onSelect({
        targetId,
        targetLabel,
        targetPath,
        selection
      });
    };
    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, [containerRef, sidebarRef, isActive, onSelect]);

  if (!isActive) {
    return null;
  }

  return (
    <div className={styles.overlayNotice}>
      <p>Режим комментариев активен · Кликните по элементу, чтобы оставить заметку.</p>
    </div>
  );
};
