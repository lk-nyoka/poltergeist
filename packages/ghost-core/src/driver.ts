/**
 * The Driver interface (brief §5.2). Ghosts act on a page only through this.
 * It makes no assumption about DOM, Playwright or any other runtime.
 */
import type { Locator, PossessOptions } from '@poltergeist/protocol';

export type { Locator, PossessOptions };

export type Unsubscribe = () => void;

/** One element as a ghost sees it: role, accessible name, bounding box, focusable. */
export type ElementInfo = {
  role: string;
  /** Accessible name; the empty string means the element has none. */
  name: string;
  /** Rendered `textContent`. */
  text: string;
  box: { x: number; y: number; width: number; height: number };
  focusable: boolean;
  testId?: string;
};

export type AxeViolation = {
  /** axe-core rule id, e.g. `button-name`. */
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  help: string;
  /** One selector or description per offending node. */
  targets: string[];
};

export type PageEventKind = 'pageerror' | 'beacon' | 'http5xx' | 'http429' | 'errorBoundary';

export type PageEvent = {
  kind: PageEventKind;
  detail: string;
  /** Driver-defined timestamp. Real drivers use milliseconds; FakeDriver uses a logical clock. */
  at: number;
};

export interface Driver {
  goto(path: string): Promise<void>;
  click(target: Locator, opts?: { count?: number; delayMs?: number }): Promise<void>;
  type(target: Locator, text: string): Promise<void>;
  press(key: 'Tab' | 'Shift+Tab' | 'Enter' | 'Escape'): Promise<void>;
  back(): Promise<void>;
  reload(): Promise<void>;
  freshSession(opts: PossessOptions): Promise<void>;
  request(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ status: number; json: unknown }>;
  /** role, accessible name, bounding box, focusable. */
  query(selector: string): Promise<ElementInfo[]>;
  focused(): Promise<ElementInfo | null>;
  axe(): Promise<AxeViolation[]>;
  /** Page errors, beacons, HTTP 5xx. */
  onEvent(cb: (e: PageEvent) => void): Unsubscribe;
  /** Moves the ghost-hand overlay (DomDriver); a no-op elsewhere. */
  pointer(x: number, y: number): void;
  /** Path (and query) of the page under observation. */
  currentPath(): Promise<string>;
  /** Sealed token of the session under observation, for ShopObserver calls. */
  sessionToken(): string;
}
