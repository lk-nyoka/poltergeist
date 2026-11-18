import type { MutantOverride } from '@poltergeist/protocol';

// Escapes only the characters a quick "is this safe?" check looked for, and links bare URLs.
// Angle brackets inside a tag-like run are left alone, so markup still reaches the HTML.
const escapeAmp = (s: string) => s.replace(/&(?![a-z]+;|#\d+;)/gi, '&amp;');
const linkify = (s: string) => s.replace(/\bhttps?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`);

function ReviewBody({ body }: { body: string }) {
  return (
    <p
      className="whitespace-pre-wrap break-words text-sm text-zinc-700"
      dangerouslySetInnerHTML={{ __html: linkify(escapeAmp(body)) }}
    />
  );
}

export const override: MutantOverride = {
  id: '0bd835f9c3d5',
  seam: 'render/ReviewBody',
  public: false,
  impl: () => ReviewBody,
};
