import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        // Primary actions and selection. Matches the data blue used in charts.
        brand: {
          50: '#eef5fd',
          100: '#d9e8fb',
          200: '#b7d3f6',
          500: '#2a78d6',
          600: '#1f65bd',
          700: '#1a529a',
          800: '#16447e',
        },
        // Neutral ink for text and surfaces.
        ink: {
          900: '#0f172a',
          700: '#334155',
          500: '#64748b',
          300: '#cbd5e1',
          100: '#f1f5f9',
          50: '#f8fafc',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)',
        float: '0 10px 30px -8px rgba(15,23,42,0.25), 0 4px 10px -4px rgba(15,23,42,0.12)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
    },
  },
  plugins: [],
};
