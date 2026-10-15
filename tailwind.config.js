/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        nss: {
          blue: '#0B2545',
          navy: '#133C55',
          saffron: '#FF9933',
          green: '#138808',
          red: '#C81D25',
          light: '#F4F7FB',
          border: '#E2E8F0',
        },
      },
    },
  },
  plugins: [],
};
