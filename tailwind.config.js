/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#192522',
        muted: '#76817b',
        canvas: '#f5f6f3',
        line: '#e5e9e5',
        forest: '#1c6b50',
        mint: '#eaf4ee',
        amber: '#a65c12',
        'amber-soft': '#fff3df',
        danger: '#b5453c',
        'danger-soft': '#fff0ed',
      },
      boxShadow: {
        card: '0 2px 10px rgba(25, 37, 34, 0.035)',
        panel: '0 18px 55px rgba(25, 37, 34, 0.16)',
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
