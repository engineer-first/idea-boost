import type { Metadata } from "next";
import { landingCopy } from "./landing-copy";

export const landingMetadata: Metadata = {
  title: landingCopy.title,
  description: landingCopy.description,
  alternates: { canonical: "https://ideaboost.dev/" },
};
