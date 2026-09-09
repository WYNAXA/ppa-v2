/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Legacy palette ────────────────────────────────────────
        // In use across every existing screen. Do not delete until the
        // last consumer has migrated to the app palette below.
        teal: {
          DEFAULT: '#009688',
          50:  '#e0f2f1',
          100: '#b2dfdb',
          500: '#009688',
          600: '#00897b',
          700: '#00796b',
        },
        'deep-teal': '#017174',
        navy: '#102134',
        cream: '#FCFCFC',
        orange: {
          DEFAULT: '#E65100',
          500: '#E65100',
          600: '#D84315',
        },
        sidebar: '#0f1117',

        // ── App palette (2026-09) — see DESIGN.md ─────────────────
        court: {
          DEFAULT: '#0F5D54',
          50:  '#EAF5F3',
          100: '#CDE7E2',
          700: '#0A473F',
        },
        line: '#12A594',
        ball: '#E4FF57',
        ink: {
          DEFAULT: '#0B1512',
          2: '#46534F',
          3: '#7C8B86',
          4: '#B6C0BB',
          surface: '#0B1512',
          card: '#141F1B',
        },
        surface: '#FBFAF7',
        card: '#FFFFFF',
        hairline: '#E4E7E4',
        alert: {
          DEFAULT: '#D9480F',
          50: '#FDF0E9',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        app:  ['Archivo', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      // Six steps. Nothing below 11px — see DESIGN.md.
      fontSize: {
        display: ['2rem',       { lineHeight: '2.125rem',  fontWeight: '800', letterSpacing: '-0.02em' }],
        title:   ['1.5rem',     { lineHeight: '1.625rem',  fontWeight: '800' }],
        heading: ['1.1875rem',  { lineHeight: '1.4375rem', fontWeight: '700' }],
        body:    ['0.9375rem',  { lineHeight: '1.25rem' }],
        label:   ['0.8125rem',  { lineHeight: '1.125rem' }],
        caption: ['0.6875rem',  { lineHeight: '0.875rem',  fontWeight: '700', letterSpacing: '0.06em' }],
      },
      borderRadius: {
        control: '0.625rem',
        card:    '0.75rem',
        panel:   '1.125rem',
        pill:    '999px',
      },
    },
  },
  plugins: [],
}
