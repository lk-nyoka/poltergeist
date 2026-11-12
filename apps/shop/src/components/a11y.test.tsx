// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { c8Violations } from '@/test/dom';

/**
 * The C8 checks themselves live in src/contract/c8-accessibility.test.tsx (tagged, and run through the
 * render seams for a session). This file only proves the axe harness CAN fail, so "zero violations" there means something.
 */
describe('the axe harness is not vacuous', () => {
  const cases: [string, string, string][] = [
    ['image-alt', '<img src="/x.svg">', 'a product image with no alt'],
    ['button-name', '<button type="button"></button>', 'an icon-only button with no name'],
    ['label', '<input type="text">', 'an input with no label'],
    ['select-name', '<select><option>1</option></select>', 'a select with no label'],
    ['link-name', '<a href="/x"></a>', 'a link with no text'],
    ['svg-img-alt', '<svg role="img"><circle r="1"/></svg>', 'an svg role=img with no name'],
  ];
  for (const [rule, html, what] of cases) {
    it(`catches ${what} as ${rule}`, async () => {
      const host = document.createElement('div');
      host.innerHTML = html;
      document.body.appendChild(host);
      try {
        expect(await c8Violations(host)).toContain(rule);
      } finally {
        host.remove();
      }
    });
  }

  it('reports nothing for a correctly named control', async () => {
    const host = document.createElement('div');
    host.innerHTML = '<label for="n">Name</label><input id="n" type="text"><button type="button">Go</button><img src="/x.svg" alt="A thing">';
    document.body.appendChild(host);
    try {
      expect(await c8Violations(host)).toEqual([]);
    } finally {
      host.remove();
    }
  });
});
