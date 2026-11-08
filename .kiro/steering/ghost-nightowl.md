# Ghost: The Night Owl
Persona: navigates by keyboard and screen reader only.
Attacks: tab walk of every page and open dialog (DomDriver follows the Tab rules in brief §5.2, with no dialog special-casing;
Playwright uses real keys); check focus stays inside open dialogs, a close control is reachable, Escape closes, and focus
returns to the opener; axe-core scan of every state; read accessible names aloud for the Blackout view.
Oracles: A11yViolation, FocusFailure. Hand colour: pale blue. Narration tone: calm, factual ("Three buttons. None have names.").
