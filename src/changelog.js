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
    version: '2026.2',
    date: '2026-11-18',
    tagline: 'The Form beside every recipe: see what changed, settle it in a click.',
    highlights: [
      {
        icon: 'difference',
        title: 'The Form spec pane, redone',
        blurb: 'Each Form entry shows its data or its paint; what changed since an older Form is marked, with Update, Replace or Add.',
      },
      {
        icon: 'add_circle',
        title: 'New ElementTypes that place themselves',
        blurb: 'One code at a time, the Form row beside the fields, a free ref that never collides, and it lands in the position.',
      },
      {
        icon: 'bolt',
        title: 'A faster Form import',
        blurb: 'Drawings are skipped and the sheet is read in the background; more Form spellings are understood.',
      },
      {
        icon: 'auto_awesome',
        title: 'Suggestions in your project’s style',
        blurb: 'New refs, families and descriptions follow how this project names things, and what you just did.',
        companion: true,
      },
    ],
    also: [
      'Export checks: Product Spec ElementTypes the DesignDB lacks are queued, and trimmed/trimless or driver current mismatches are flagged',
      'Click a product code to copy it; click an ElementType to open it in the Product Spec',
      'Placeholder codes (N/A, TBC, -) are no longer duplicates, and TBC and notes carry through',
      'The finish shows in brackets after both descriptions; DimMult and PackQty show whenever they hold a value',
      'Bad refs (spaces, empty parts) are offered a rename',
      'The right drawer can be resized',
      'A bug note can include your data, so the problem can be replayed exactly',
    ],
  },
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
        title: 'Connected Learning Suggestions',
        blurb: 'Purple cards propose suggestions based on other product spec and recipe work across the team.',
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
      'A sent bug note names its code, and the build name in the corner says which version you are on',
    ],
  },
]

export const LATEST = RELEASES[0]
