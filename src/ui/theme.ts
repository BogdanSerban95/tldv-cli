import pc from "picocolors";

let colors = pc.createColors(pc.isColorSupported);

/** `--no-color` and NO_COLOR both land here. */
export function setColorEnabled(enabled: boolean): void {
  colors = pc.createColors(enabled);
}

export function colorEnabled(): boolean {
  return colors.isColorSupported;
}

// Indirection rather than re-exporting picocolors: setColorEnabled rebinds `colors`, and a
// direct re-export would capture the original bindings.
export const theme = {
  bold: (value: string) => colors.bold(value),
  dim: (value: string) => colors.dim(value),
  red: (value: string) => colors.red(value),
  green: (value: string) => colors.green(value),
  yellow: (value: string) => colors.yellow(value),
  blue: (value: string) => colors.blue(value),
  cyan: (value: string) => colors.cyan(value),
  magenta: (value: string) => colors.magenta(value),
  gray: (value: string) => colors.gray(value),
  underline: (value: string) => colors.underline(value),
};

export const symbols = {
  success: "✔",
  warn: "!",
  error: "✖",
  info: "›",
  bullet: "•",
};
