/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // AllGO Orange Brand Colors (CSS variable driven)
        primary: {
          50: 'var(--color-primary-pale)',
          100: 'var(--color-primary-light)',
          200: 'var(--color-primary-light)',
          300: 'var(--color-primary-light)',
          400: 'var(--color-primary)',
          500: 'var(--color-primary)',
          600: 'var(--color-primary-dark)',
          700: 'var(--color-primary-dark)',
          800: 'var(--color-deep)',
          900: 'var(--color-deep)',
        },
        neutral: {
          bg: 'var(--color-background)',
          surface: 'var(--color-background)',
          elevated: 'var(--color-background)',
          border: 'var(--color-border)',
        },
        warningPale: 'var(--color-warning-pale)',
        successPale: 'var(--color-success-pale)',
        errorPale: 'var(--color-error-pale)',
        accent: 'var(--color-warning)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',
      },
    },
  },
  plugins: [],
}
