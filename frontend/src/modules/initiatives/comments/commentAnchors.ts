export type CommentAnchorAttributes = Record<string, string>;

const normalize = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const createCommentAnchor = (id: string, label?: string | null): CommentAnchorAttributes => {
  const anchor = normalize(id);
  if (!anchor) {
    return {};
  }
  const attributes: CommentAnchorAttributes = { 'data-comment-anchor': anchor };
  const normalizedLabel = normalize(label);
  if (normalizedLabel) {
    attributes['data-comment-label'] = normalizedLabel;
  }
  return attributes;
};
