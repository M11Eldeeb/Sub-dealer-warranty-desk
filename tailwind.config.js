/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  // hover: styles only apply on devices that really hover, so a tap on a phone does not leave a card "hovered".
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      // One house easing for every UI transition: quick start, soft landing (the built-in curves feel flat).
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.23, 1, 0.32, 1)",
        "out-strong": "cubic-bezier(0.23, 1, 0.32, 1)",
        "in-out-strong": "cubic-bezier(0.77, 0, 0.175, 1)",
      },
      transitionDuration: { DEFAULT: "160ms" },
      // transition-colors also carries transform, so the press feedback on buttons animates.
      transitionProperty: {
        colors: "color, background-color, border-color, text-decoration-color, fill, stroke, transform",
      },
    },
  },
  plugins: [],
};
