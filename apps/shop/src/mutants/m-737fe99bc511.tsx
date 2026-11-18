import type { MutantOverride } from '@poltergeist/protocol';

// Blacklist "sanitiser": strips <script> blocks, then renders the rest as HTML.
const stripScripts = (s: string) => s.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');

function ReviewBody({ body }: { body: string }) {
  return (
    <p
      className="whitespace-pre-wrap break-words text-sm text-zinc-700"
      dangerouslySetInnerHTML={{ __html: stripScripts(body) }}
    />
  );
}

export const override: MutantOverride = {
  id: '737fe99bc511',
  seam: 'render/ReviewBody',
  public: false,
  impl: () => ReviewBody,
};
