// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sidebars: any = {
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
} as const;

export default sidebars;
