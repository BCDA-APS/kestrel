/**
 * Format a Unix timestamp to ISO8601 format with local timezone abbreviation.
 * 
 * @param timestampSeconds - Unix timestamp in seconds (Bluesky convention)
 * @returns Formatted string as "YYYY-MM-DD HH:mm:ss ZZZ" (e.g., "2026-11-19 14:30:45 CST")
 */
export function formatDateTimeISO8601(timestampSeconds: number | null | undefined): string {
  if (timestampSeconds == null) {
    return '—';
  }

  const date = new Date(timestampSeconds * 1000);
  
  // Get ISO8601 date and time components
  const isoString = date.toISOString();
  const [datePart, timePart] = isoString.split('T');
  const timeWithoutMs = timePart.slice(0, 8); // HH:mm:ss
  
  // Get timezone abbreviation (locale-aware, e.g., "CST", "EST")
  const tzFormatter = new Intl.DateTimeFormat(undefined, {
    timeZoneName: 'short'
  });
  const parts = tzFormatter.formatToParts(date);
  const tzPart = parts.find(p => p.type === 'timeZoneName')?.value || '';
  
  return `${datePart} ${timeWithoutMs} ${tzPart}`.trim();
}
