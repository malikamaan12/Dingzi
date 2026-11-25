// dingzi Official Tailwind CSS Theme Preset (v1.0)
module.exports = {
  theme: {
    extend: {
      colors: {
        dingzi: {
          violet: '#6236FF',
          'violet-deep': '#4B1FE0',
          'violet-wash': '#EFEAFF',
          volt: '#C8FF42',
          indigo: '#17132E',
          'indigo-elevated': '#241E42',
          'indigo-active': '#312959',
          white: '#FFFFFF',
          mist: '#F6F5FC',
          hairline: '#E5E2F2',
          muted: '#57507A',
          overdue: '#FF4D6D',
        },
      },
      fontFamily: {
        display: ['Plus Jakarta Sans', 'Bricolage Grotesque', 'system-ui', 'sans-serif'],
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        arabic: ['IBM Plex Sans Arabic', 'Noto Sans Arabic', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Google Sans Code', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        'dz-card': '20px',
        'dz-sheet': '28px',
        'dz-input': '14px',
      },
      boxShadow: {
        'dz-card': '0 8px 24px -6px rgba(23, 19, 46, 0.08)',
        'dz-violet': '0 10px 26px -6px rgba(98, 54, 255, 0.38)',
        'dz-volt': '0 12px 32px -6px rgba(200, 255, 66, 0.50)',
      },
    },
  },
};
