const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Integer USD cents → "$24.00". USD only (brief §6). */
export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}
