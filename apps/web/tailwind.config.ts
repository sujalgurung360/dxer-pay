import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        purple: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
          800: '#6b21a8',
          900: '#581c87',
          950: '#3b0764',
        },
        cream: {
          50: '#fefdfb',
          100: '#fdf9f3',
          200: '#faf3e8',
          300: '#f5ead8',
          400: '#ede0c8',
        },
        surface: {
          50: '#faf9fc',
          100: '#f5f3f8',
          200: '#edeaf2',
          300: '#e2dfe8',
          400: '#d5d1dd',
        },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      fontFamily: {
        serif: ['DM Serif Display', 'Georgia', 'Times New Roman', 'serif'],
        sans: ['DM Sans', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.03)',
        'card-md': '0 4px 12px -2px rgba(0, 0, 0, 0.06), 0 2px 4px -2px rgba(0, 0, 0, 0.04)',
        'card-lg': '0 10px 30px -6px rgba(0, 0, 0, 0.08)',
        'nav': '0 1px 3px 0 rgba(0, 0, 0, 0.03)',
        'purple': '0 4px 14px -3px rgba(147, 51, 234, 0.25)',
        'purple-lg': '0 8px 25px -4px rgba(147, 51, 234, 0.3)',
      },
    },
  },
  plugins: [],
};

export default config;
