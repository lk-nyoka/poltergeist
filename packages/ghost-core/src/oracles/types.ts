import type { OracleName, Rule } from '@poltergeist/protocol';
import type { AxeViolation, PageEvent } from '../driver';
import type { CleanProducts, LedgerEntry, OrderRecord } from '../observer';

/** One walk of an open dialog by the Night Owl (see `traceDialogFocus`). */
export type FocusTrace = {
  /** Accessible name of the control that opened the dialog. */
  opener: string;
  /** Each focus stop reached by Tab while the dialog was open. */
  sequence: { label: string; inDialog: boolean; isClose: boolean }[];
  /** Whether Escape alone closed the dialog. */
  escapeCloses: boolean;
  /** Whether the dialog ended up closed (by Escape or by its close control). */
  closed: boolean;
  /** Accessible name of the focused element after closing, or null. */
  returnedTo: string | null;
};

/** A name, address or review that was submitted and then read back from the page. */
export type TextCheck = {
  field: 'name' | 'address' | 'review';
  submitted: string;
  /** `textContent` read back, or null when it could not be read. */
  rendered: string | null;
};

export type Observation = {
  ledgers: { customer: LedgerEntry[]; till: LedgerEntry[]; customerStart: number; tillStart: number };
  orders: OrderRecord[];
  reads: { orderId: string }[];
  intents: { id: string }[];
  clean: CleanProducts;
  events: PageEvent[];
  axe: AxeViolation[];
  focus: FocusTrace[];
  texts: TextCheck[];
  /** Recorded after a reload or back step: whether the paid order is still visible. */
  refreshChecks: { intentId: string; orderVisible: boolean }[];
};

/** What an oracle returns. `evidence` holds the oracle's own numbers, element or token. */
export type OracleHit = {
  oracle: OracleName;
  /** Best guess at the rule broken. The scorer decides kills through `ORACLE_RULES`, not through this. */
  rule: Rule;
  title: string;
  /** One line on who is hurt. */
  harm: string;
  evidence: Record<string, unknown>;
};

export type Oracle = (obs: Observation) => OracleHit[];
