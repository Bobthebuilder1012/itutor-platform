/**
 * Physical classes — venues, per-seat capacity, and cash payments.
 *
 * The whole feature behind one switch, the same shape as
 * lib/featureFlags/parentAccounts.ts.
 *
 * Default ENABLED so staging, previews and local development keep it. Set
 * PHYSICAL_CLASSES_ENABLED=false in production to take it off.
 *
 * ── WHAT TURNING IT OFF DOES, AND DELIBERATELY DOES NOT ────────────────────
 * Off hides every way to CREATE or CHOOSE a physical arrangement: the format
 * picker on class creation and settings, the venue manager, the marketplace
 * location filter, and the cash payment option. Both routes that accept a
 * format or a venue refuse a non-online value server-side too, because hiding
 * a control stops nobody from posting past it.
 *
 * Off does NOT strip the reading side. A class that is already physical keeps
 * its venue, its seats and its enrolments, and every surface that DISPLAYS
 * them keeps working — the attendance register, the payments grid, the seat
 * column on the roster, the student's own class page. Blanking those would
 * turn a flag into data loss for anyone mid-term, and the flag exists to be
 * flipped back.
 *
 * This is why the feature is gated rather than reverted. The physical-classes
 * commits also replaced a Payments tab that fabricated its cell states, fixed a
 * student attendance read that queried a table which does not exist, and made
 * dunning notices say something a cash student can act on. Those are fixes to
 * things that were already wrong; reverting to remove the feature would take
 * them with it.
 */

export const PHYSICAL_CLASSES_DISABLED_MESSAGE =
  'In-person classes are not available yet. Classes meet online for now.';

export function isPhysicalClassesEnabled(): boolean {
  const val = (process.env.PHYSICAL_CLASSES_ENABLED ?? 'true').toLowerCase();
  return val !== 'false';
}
