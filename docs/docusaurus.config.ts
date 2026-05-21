import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

const config: Config = {
  title: "zkTGuard",
  tagline: "Privacy-preserving Telegram credentials on TON",
  favicon: "img/favicon.svg",

  url: "https://zktguard.example",
  baseUrl: "/",

  organizationName: "Igorprostoff",
  projectName: "zktguard",

  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          routeBasePath: "/",
          editUrl:
            "https://github.com/Igorprostoff/zktguard/tree/main/docs/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      },
    ],
  ],

  themeConfig: {
    image: "img/social-card.png",
    navbar: {
      title: "zkTGuard",
      logo: { alt: "zkTGuard", src: "img/favicon.svg" },
      items: [
        { to: "/", label: "Overview", position: "left" },
        { to: "/construction", label: "Construction", position: "left" },
        { to: "/architecture", label: "Architecture", position: "left" },
        { to: "/running", label: "Running", position: "left" },
        { to: "/sdk", label: "SDK", position: "left" },
        { to: "/examples", label: "Examples", position: "left" },
        { to: "/paper", label: "Paper", position: "left" },
        { to: "/faq", label: "FAQ", position: "left" },
        {
          href: "https://github.com/Igorprostoff/zktguard",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Overview", to: "/" },
            { label: "Construction", to: "/construction" },
            { label: "Architecture", to: "/architecture" },
          ],
        },
        {
          title: "More",
          items: [
            { label: "GitHub", href: "https://github.com/Igorprostoff/zktguard" },
            { label: "Paper", to: "/paper" },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Igor Prostov. Released under MIT.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "diff", "json", "rust", "go"],
    },
  },
};

export default config;
