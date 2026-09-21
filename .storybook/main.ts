import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  framework: "@storybook/nextjs-vite",
  stories: [
    "../app/**/*.stories.@(ts|tsx)",
    "../features/**/*.stories.@(ts|tsx)",
    "../components/**/*.stories.@(ts|tsx)",
  ],
  addons: ["@storybook/addon-docs"],
  staticDirs: [
    "../public",
    { from: "../schema-diagrams", to: "/schema-diagrams" },
    { from: "../dependency-diagrams", to: "/dependency-diagrams" },
  ],
  viteFinal: (config) => ({
    ...config,
    envPrefix: ["VITE_", "STORYBOOK_", "NEXT_PUBLIC_"],
  }),
};

export default config;
