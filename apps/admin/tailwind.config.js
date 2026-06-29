/** @type {import('tailwindcss').Config} */

// Wrap a CSS-variable channel triplet so Tailwind opacity modifiers work
// (e.g. bg-primary-500/10, ring-primary-500/30).
const withAlpha = (v) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      colors: {
        // AllGO Orange Brand Colors (CSS variable driven, alpha-aware)
        primary: {
          50: withAlpha('--color-primary-pale'),
          100: withAlpha('--color-primary-light'),
          200: withAlpha('--color-primary-light'),
          300: withAlpha('--color-primary-light'),
          400: withAlpha('--color-primary'),
          500: withAlpha('--color-primary'),
          600: withAlpha('--color-primary-dark'),
          700: withAlpha('--color-primary-dark'),
          800: withAlpha('--color-deep'),
          900: withAlpha('--color-deep'),
        },
        neutral: {
          bg: withAlpha('--color-background'),
          surface: withAlpha('--color-background'),
          elevated: withAlpha('--color-background'),
          border: withAlpha('--color-border'),
        },
        warningPale: withAlpha('--color-warning-pale'),
        successPale: withAlpha('--color-success-pale'),
        errorPale: withAlpha('--color-error-pale'),
        accent: withAlpha('--color-warning'),
        success: withAlpha('--color-success'),
        warning: withAlpha('--color-warning'),
        error: withAlpha('--color-error'),
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 8px 24px -8px rgb(15 23 42 / 0.08)',
      },
    },
  },
  plugins: [],
}
