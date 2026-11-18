/**
 * Scripts evaluated inside the page. They are plain strings (not functions) so they run without
 * DOM typings here and survive transpilers that rewrite function bodies (esbuild `__name`).
 */

const DESCRIBE = `
function describe(el) {
  var IMPLICIT = { button: 'button', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading',
    h6: 'heading', li: 'listitem', ul: 'list', ol: 'list', p: 'paragraph', img: 'img', select: 'combobox',
    textarea: 'textbox', nav: 'navigation', main: 'main', dialog: 'dialog', table: 'table' };
  var tag = el.tagName.toLowerCase();
  var type = (el.getAttribute('type') || 'text').toLowerCase();
  var role = el.getAttribute('role');
  if (!role) {
    if (tag === 'a') role = el.hasAttribute('href') ? 'link' : 'generic';
    else if (tag === 'input') {
      role = { checkbox: 'checkbox', radio: 'radio', number: 'spinbutton', range: 'slider', search: 'searchbox',
        submit: 'button', button: 'button', reset: 'button', image: 'button' }[type] || 'textbox';
    } else role = IMPLICIT[tag] || 'generic';
  }
  function text(n) { return (n.textContent || '').replace(/\\s+/g, ' ').trim(); }
  var name = el.getAttribute('aria-label');
  if (!name) {
    var by = el.getAttribute('aria-labelledby');
    if (by) name = by.split(/\\s+/).map(function (id) { var t = document.getElementById(id); return t ? text(t) : ''; }).join(' ').trim();
  }
  if (!name && el.labels && el.labels.length) name = Array.prototype.map.call(el.labels, text).join(' ').trim();
  if (!name && (tag === 'img' || (tag === 'input' && type === 'image'))) name = el.getAttribute('alt') || '';
  if (!name && tag === 'input' && (type === 'submit' || type === 'button' || type === 'reset')) name = el.value || '';
  if (!name && ['button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'p'].indexOf(tag) >= 0 || (!name && role === 'dialog')) name = text(el);
  if (!name) name = el.getAttribute('title') || '';
  var r = el.getBoundingClientRect();
  var focusable = !el.disabled && el.tabIndex >= 0 &&
    (el.matches('a[href],button,input,select,textarea,summary,[tabindex],[contenteditable]'));
  var out = {
    role: role, name: String(name || ''),
    text: (tag === 'input' || tag === 'textarea') ? String(el.value || '') : (el.textContent || ''),
    box: { x: r.x, y: r.y, width: r.width, height: r.height }, focusable: !!focusable
  };
  var id = el.getAttribute('data-testid');
  if (id) out.testId = id;
  return out;
}
`;

/** Evaluate as `(${QUERY_SCRIPT})(selector)`; returns ElementInfo[] (at most 200). */
export const QUERY_SCRIPT = `(function (selector) {
  ${DESCRIBE}
  return Array.prototype.slice.call(document.querySelectorAll(selector), 0, 200).map(describe);
})`;

/** Evaluate as `(${FOCUSED_SCRIPT})()`; returns ElementInfo | null. */
export const FOCUSED_SCRIPT = `(function () {
  ${DESCRIBE}
  var el = document.activeElement;
  return !el || el === document.body || el === document.documentElement ? null : describe(el);
})`;

/** Evaluate after axe-core is defined. Returns AxeViolation[]. */
export const AXE_RUN_SCRIPT = `axe.run(document, { resultTypes: ['violations'] }).then(function (r) {
  return r.violations.map(function (v) {
    return { id: v.id, impact: v.impact || null, help: v.help,
      targets: v.nodes.map(function (n) { return Array.isArray(n.target) ? n.target.join(' ') : String(n.target); }) };
  });
})`;
