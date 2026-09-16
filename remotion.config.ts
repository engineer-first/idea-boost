import path from "node:path";
import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

Config.overrideBundlerConfig((currentConfiguration) => {
  const configuration = enableTailwind(currentConfiguration);

  return {
    ...configuration,
    resolve: {
      ...configuration.resolve,
      alias: {
        ...(configuration.resolve?.alias ?? {}),
        "@": path.resolve(process.cwd()),
      },
    },
  };
});
