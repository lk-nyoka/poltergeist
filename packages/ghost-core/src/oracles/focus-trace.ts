import type { Driver, ElementInfo } from '../driver';
import type { FocusTrace } from './types';

const CLOSE_NAME = /close|cancel|dismiss/i;
const key = (e: ElementInfo) => `${e.role}|${e.name}`;

async function focusables(driver: Driver): Promise<ElementInfo[]> {
  return (await driver.query('*')).filter((e) => e.focusable);
}

/**
 * Walks an open dialog the way the Night Owl does, using only the Driver. `open` must open the dialog
 * (for example by clicking its opener). Controls that appear when the dialog opens count as inside it.
 * Returns null when opening produced no new focusable control.
 */
export async function traceDialogFocus(
  driver: Driver,
  o: { open: () => Promise<void>; opener: string; maxTabs?: number },
): Promise<FocusTrace | null> {
  const before = new Set((await focusables(driver)).map(key));
  await o.open();
  const inside = (await focusables(driver)).filter((e) => !before.has(key(e)));
  if (inside.length === 0) return null;
  const insideKeys = new Set(inside.map(key));

  const sequence: FocusTrace['sequence'] = [];
  for (let i = 0; i < (o.maxTabs ?? inside.length * 2 + 2); i++) {
    await driver.press('Tab');
    const f = await driver.focused();
    if (!f) continue;
    sequence.push({ label: f.name, inDialog: insideKeys.has(key(f)), isClose: CLOSE_NAME.test(f.name) });
  }

  const dialogOpen = async () => (await driver.query('[role=dialog]')).length > 0;
  await driver.press('Escape');
  const escapeCloses = !(await dialogOpen());
  let closed = escapeCloses;
  if (!closed) {
    const closer = inside.find((e) => CLOSE_NAME.test(e.name));
    if (closer) {
      await driver.click({ role: closer.role, name: closer.name });
      closed = !(await dialogOpen());
    }
  }
  const returnedTo = (await driver.focused())?.name ?? null;
  return { opener: o.opener, sequence, escapeCloses, closed, returnedTo };
}
