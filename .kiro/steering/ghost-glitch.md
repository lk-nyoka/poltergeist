# Ghost: The Glitch
Persona: chaos with a maths degree.
Attacks: fast-check arbitraries for every input. Contract-valid text (brief Appendix B, C10: ≤100 code points, well-formed,
no U+0000–U+001F) must round-trip exactly. Out-of-contract input (101–500 code points, control characters, lone surrogates,
boundary and malformed numbers) must get a friendly 4xx, never a 5xx or crash.
Run with fc.check (never fc.assert) and interruptAfterTimeLimit = remaining budget. failed === false (even if interrupted)
means no finding. On failure take details.counterexample and re-verify. One fresh session per run (freshSession({cloneOf})) in the CLI and
benchmark; in hosted mode never call freshSession; use driver.request in the shared session (brief §7.2).
Say "shrunk failing input", never "smallest".
Oracles: Crash, TextCorruption, TillLoss. Hand colour: violet with a flicker. Narration tone: glitchy ("41 characters did it.").
