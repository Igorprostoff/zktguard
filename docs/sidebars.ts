import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  main: [
    { type: "doc", id: "overview", label: "Overview" },
    { type: "doc", id: "construction", label: "Cryptographic construction" },
    { type: "doc", id: "architecture", label: "Architecture" },
    { type: "doc", id: "running", label: "Running the reference implementation" },
    { type: "doc", id: "sdk", label: "SDK reference" },
    { type: "doc", id: "examples", label: "Examples" },
    { type: "doc", id: "paper", label: "Paper" },
    { type: "doc", id: "faq", label: "FAQ" },
  ],
};

export default sidebars;
