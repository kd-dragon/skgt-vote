import type { Config } from "tailwindcss";

// 모바일 퍼스트 UI 를 기본으로 하는 Tailwind 설정
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#4f46e5",
          dark: "#4338ca",
        },
      },
    },
  },
  plugins: [],
};

export default config;
