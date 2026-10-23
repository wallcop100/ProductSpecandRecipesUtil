/**
 * changelog.js — the release notes shown under the start page's "what's new".
 *
 * Versions are Year.release (2026.1, 2026.2 …; the count restarts each year). To ship one,
 * add a release on top of RELEASES: a version, the date, a one-line tagline, three or four
 * highlights (a Material icon, a short title, one or two sentences) and an optional `also`
 * list of smaller things. Newest first. Write it for the people using the tool, not for us:
 * what they can do now, not how it was built. Keep anything companion-only out of it, since
 * the GitHub Pages release has no companion.
 */
export const RELEASES = [
  {
    version: '2026.1',
    date: '2026-10-23',
    tagline: 'From the Form to finished recipes, with the connectors done for you.',
    highlights: [
      {
        icon: 'brush',
        title: 'Import the Form by painting it',
        blurb: 'Paint product codes straight onto the Form, one position at a time if you like. The tool learns how each project writes its codes and files new ElementTypes into the company families. When the Form changes on disk it offers a Refresh and shows what moved.',
      },
      {
        icon: 'cable',
        title: 'Connector templates',
        blurb: 'Make a template from positions built the same way, or start from the Wago library. Templates apply by rule (tags, DesignDB columns, what the recipe holds), and the Connectors tab shows what each position is missing.',
      },
      {
        icon: 'view_sidebar',
        title: 'A calmer builder',
        blurb: 'Positions sit in a sidebar, each with one status pip that explains itself. The Form sits beside the recipe, wrappers can be exploded into editable parts, and Ctrl+Z / Ctrl+Y work on every screen.',
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
