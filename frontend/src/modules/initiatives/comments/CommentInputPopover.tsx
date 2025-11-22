import React, { useEffect, useRef, useState } from 'react';
import styles from '../../../styles/InitiativeComments.module.css';

interface CommentInputPopoverProps {
    visible: boolean;
    position: { top: number; left: number };
    onSubmit: (body: string) => Promise<void>;
    onCancel: () => void;
}

export const CommentInputPopover = ({
    visible,
    position,
    onSubmit,
    onCancel
}: CommentInputPopoverProps) => {
    const [draft, setDraft] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (visible && inputRef.current) {
            inputRef.current.focus();
        }
    }, [visible]);

    if (!visible) {
        return null;
    }

    const handleSubmit = async () => {
        if (!draft.trim()) return;
        setIsSaving(true);
        try {
            await onSubmit(draft);
            setDraft('');
        } finally {
            setIsSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSubmit();
        } else if (e.key === 'Escape') {
            onCancel();
        }
    };

    return (
        <div
            className={styles.popoverContainer}
            style={{ top: position.top, left: position.left }}
            onClick={(e) => e.stopPropagation()}
        >
            <textarea
                ref={inputRef}
                className={styles.popoverTextarea}
                placeholder="Leave a comment"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
            />
            <div className={styles.popoverActions}>
                <button className={styles.popoverCancel} onClick={onCancel} type="button">
                    Cancel
                </button>
                <button
                    className={styles.popoverSubmit}
                    onClick={handleSubmit}
                    disabled={!draft.trim() || isSaving}
                    type="button"
                >
                    {isSaving ? 'Saving...' : 'Add Comment'}
                </button>
            </div>
        </div>
    );
};
