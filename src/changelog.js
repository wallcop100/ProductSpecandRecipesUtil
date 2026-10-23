/**
 * changelog.js — the release notes shown under the start page's "what's new".
 *
 * Versions are Year.release (2026.1, 2026.2 …; the count restarts each year). To ship one,
 * add a release on top of RELEASES: a version, the date, a one-line tagline, three or four
 * highlights (a Material icon, a short title, one short line) and an optional `also`
 * list of smaller things. Newest first. Write it for the people using the tool, not for us:
 * what they can do now, not how it was built. Mark a companion-only highlight `companion: true`:
 * the GitHub Pages release has no companion, so WhatsNew hides it there.
 */
export const RELEASES = [
  {
    version: '2026.1',
    date: '2026-10-23',
    tagline: '2026 Alpha Build - From form to finished recipes.',
    highlights: [
      {
        icon: 'brush',
        title: 'Import the Form by painting it',
        blurb: 'Paint codes onto the Form; new ElementTypes file themselves into the company families.',
      },
      {
        icon: 'cable',
        title: 'Connector templates',
        blurb: 'Made from positions built alike or the Wago library, applied by rule.',
      },
      {
        icon: 'view_sidebar',
        title: 'A calmer builder',
        blurb: 'A position sidebar, one status pip each, and undo on every screen.',
      },
      {
        icon: 'auto_awesome',
        title: 'Suggestions from the companion',
        blurb: 'Purple cards propose recipe lines from your kits and positions built alike.',
        companion: true,
      },
    ],
    also: [
      'Merge duplicate product codes, move ElementTypes to another family, and clean up unused ones',
      'Review recipes with rule filters, saved filter sets and your own columns',
      'Recipe styles, Apply a template to many positions, and Fork a position',
      'Back up and restore all your work from the start page',
      'Tutorial cards on every pane, and right-click anything to write a bug note',
      'A steadier DesignDB patch: tree order, whole rows moved, and it runs in Office Scripts',
    ],
  },
]

export const LATEST = RELEASES[0]
