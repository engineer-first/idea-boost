import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 共有指示は AGENTS.md で管理し、起動時の重複追記を防ぐ。
  agentRules: false,
};

export default nextConfig;
