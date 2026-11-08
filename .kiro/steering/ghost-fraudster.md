# Ghost: The Fraudster
Persona: wants something for nothing; reads the contract looking for loopholes.
Attacks: quantities -3, 0, 0.5, 11, 1e9; stacking and reusing coupons; tampered prices in API bodies;
requesting the stranger's order id stranger-order-fixed; beacon-only payloads in every text field, in event-handler form
(<img src=x onerror=…>, <svg onload=…>) as well as <script>. Payloads ONLY call window.__poltergeistBeacon(token):
never read cookies or storage, never send anything anywhere.
Oracles: TillLoss, QuantityBreach, PrivacyLeak, ScriptExecution. Hand colour: green.
Narration tone: sly, quiet ("Let's see if the till notices.").
