import { theme } from "./theme.js";

export interface Column {
  header: string;
  /** Column soaks up leftover width and is truncated first when the terminal is narrow. */
  flex?: boolean;
  align?: "left" | "right";
  minWidth?: number;
}

const GAP = 2;
const ELLIPSIS = "…";
// Built from a char code because an ESC escape inside a regex literal trips lint rules.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** Visible width, ignoring ANSI escapes so colored cells still align. */
export function displayWidth(value: string): number {
  return value.replace(ANSI, "").length;
}

export function truncate(value: string, width: number): string {
  if (width <= 0) return "";
  if (displayWidth(value) <= width) return value;
  return `${value.slice(0, Math.max(0, width - 1))}${ELLIPSIS}`;
}

function padCell(value: string, width: number, align: "left" | "right"): string {
  const padding = " ".repeat(Math.max(0, width - displayWidth(value)));
  return align === "right" ? `${padding}${value}` : `${value}${padding}`;
}

/**
 * Fixed-width table sized to the terminal. Hand-rolled because the column set is known and
 * a dependency would only add unicode-width handling the data does not need.
 */
export function renderTable(
  columns: readonly Column[],
  rows: readonly string[][],
  terminalWidth = process.stdout.columns || 120,
): string {
  if (rows.length === 0) return "";

  const widths = columns.map((column, index) => {
    const longestCell = rows.reduce(
      (max, row) => Math.max(max, displayWidth(row[index] ?? "")),
      displayWidth(column.header),
    );
    return Math.max(longestCell, column.minWidth ?? 0);
  });

  const totalGap = GAP * (columns.length - 1);
  const overflow = widths.reduce((sum, width) => sum + width, 0) + totalGap - terminalWidth;
  if (overflow > 0) {
    const flexIndex = columns.findIndex((column) => column.flex);
    if (flexIndex >= 0) {
      const column = columns[flexIndex]!;
      widths[flexIndex] = Math.max(column.minWidth ?? 10, widths[flexIndex]! - overflow);
    }
  }

  const lines: string[] = [];
  lines.push(
    columns
      .map((column, index) =>
        padCell(theme.dim(column.header), widths[index]!, column.align ?? "left"),
      )
      .join(" ".repeat(GAP))
      .trimEnd(),
  );

  for (const row of rows) {
    lines.push(
      columns
        .map((column, index) =>
          padCell(
            truncate(row[index] ?? "", widths[index]!),
            widths[index]!,
            column.align ?? "left",
          ),
        )
        .join(" ".repeat(GAP))
        .trimEnd(),
    );
  }

  return `${lines.join("\n")}\n`;
}
