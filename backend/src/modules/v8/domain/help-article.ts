export type HelpStatus = 'draft' | 'published' | 'archived';
export type HelpContentInput = {
  titleZh: string; titleEn: string; bodyZh: string; bodyEn: string;
  category: string; keywords: string[]; sortWeight: number; status: HelpStatus;
};

export function normalizeHelpContent(input: HelpContentInput, allowedCategories: readonly string[], previousStatus?: HelpStatus) {
  const content = { status: input.status, sortWeight: input.sortWeight, titleZh: input.titleZh.trim(), titleEn: input.titleEn.trim(),
    bodyZh: input.bodyZh.trim(), bodyEn: input.bodyEn.trim(), category: input.category.trim(),
    keywords: [...new Set(input.keywords.flatMap(value => value.split(/[,，]/u)).map(value => value.trim()).filter(Boolean))] };
  if (!content.titleZh || !content.titleEn || !allowedCategories.includes(content.category) || !Number.isFinite(content.sortWeight))
    throw new Error('HELP_CONTENT_INVALID');
  if (!['draft', 'published', 'archived'].includes(content.status)) throw new Error('HELP_STATUS_INVALID');
  if (previousStatus === undefined && content.status === 'archived') throw new Error('HELP_TRANSITION_INVALID');
  if (previousStatus !== undefined && previousStatus !== content.status &&
    !((previousStatus === 'draft' && content.status === 'published') ||
      (previousStatus === 'published' && content.status === 'archived') ||
      (previousStatus === 'archived' && content.status === 'published'))) throw new Error('HELP_TRANSITION_INVALID');
  if (content.status === 'published' && (!content.bodyZh || !content.bodyEn || content.keywords.length === 0))
    throw new Error('HELP_PUBLICATION_INCOMPLETE');
  return content;
}
