import { seamComponent } from '@/seams/registry';

/** C7: user text is rendered as a React text child, never as HTML. No dangerouslySetInnerHTML anywhere. */
export function ReviewBody({ body }: { body: string }) {
  return <p className="whitespace-pre-wrap break-words text-sm text-zinc-700">{body}</p>;
}

/** Render seam. Resolve inside withPage() so mutants arrive as server-rendered variants (REQ-9.4). */
export const ReviewBodySeam = seamComponent('render/ReviewBody', ReviewBody);
