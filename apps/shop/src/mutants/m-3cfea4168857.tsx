import type { MutantOverride } from '@poltergeist/protocol';

// Rendered as HTML "so line breaks and simple formatting in reviews show up".
function ReviewBody({ body }: { body: string }) {
  return <p className="whitespace-pre-wrap break-words text-sm text-zinc-700" dangerouslySetInnerHTML={{ __html: body }} />;
}

export const override: MutantOverride = {
  id: '3cfea4168857',
  seam: 'render/ReviewBody',
  public: false,
  impl: () => ReviewBody,
};
