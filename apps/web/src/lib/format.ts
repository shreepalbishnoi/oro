/** Dates are always shown in IST so server and browser render the same string. */
const IST = "Asia/Kolkata";

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00+05:30` : iso);
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST, ...opts }).format(d);
}

export function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
