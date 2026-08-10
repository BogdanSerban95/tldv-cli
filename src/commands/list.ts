import { Command } from "commander";

import { userLabel } from "../api/normalize.js";
import type { Meeting } from "../api/types.js";
import { createContext, positiveInt } from "../context.js";
import { formatDateTime, formatRelative, humanizeDuration } from "../core/dates.js";
import { createSpinner } from "../ui/spinner.js";
import { renderTable } from "../ui/table.js";
import { theme } from "../ui/theme.js";
import { addFilterOptions, buildListParams, type FilterOptions } from "./shared.js";

interface ListOptions extends FilterOptions {
  limit?: string;
  page?: string;
  all?: boolean;
  json?: boolean;
  ids?: boolean;
}

export function listCommand(): Command {
  const command = new Command("ls")
    .alias("list")
    .description("list meetings")
    .option("-n, --limit <count>", "meetings per page, max 100", "20")
    .option("--page <number>", "page to fetch", "1")
    .option("--all", "page through every match instead of one page")
    .option("--ids", "print bare meeting ids, one per line")
    .option("--json", "print the raw API payload");

  addFilterOptions(command).action(async (options: ListOptions, self: Command) => {
    const ctx = createContext(self);
    const params = buildListParams(options);
    const limit = positiveInt(options.limit, 20, "--limit");
    const page = positiveInt(options.page, 1, "--page");
    const plain = options.json === true || options.ids === true;

    const spinner = createSpinner("Fetching meetings…", ctx.out.isInteractive && !plain);
    const meetings: Meeting[] = [];
    let total = 0;

    try {
      if (options.all) {
        for await (const meeting of ctx.api.iterateMeetings(
          { ...params, limit: 100 },
          {
            onPage: (result) => {
              total = result.total;
              spinner.update(`Fetching meetings… ${meetings.length}/${result.total}`);
            },
            onCapped: (count) =>
              ctx.out.warn(
                `${count.toLocaleString()} meetings match; tl;dv stops paging at 10,000. Narrow --from/--to.`,
              ),
          },
        )) {
          meetings.push(meeting);
        }
      } else {
        const result = await ctx.api.listMeetings({ ...params, limit, page });
        meetings.push(...result.results);
        total = result.total;
      }
      spinner.stop();
    } catch (error) {
      spinner.stop();
      throw error;
    }

    if (options.json) {
      ctx.out.json({ total, count: meetings.length, results: meetings.map((m) => m.raw) });
      return;
    }

    if (options.ids) {
      for (const meeting of meetings) ctx.out.line(meeting.id);
      return;
    }

    if (meetings.length === 0) {
      ctx.out.warn("No meetings match those filters.");
      return;
    }

    ctx.out.data(
      renderTable(
        [
          { header: "WHEN" },
          { header: "AGO", align: "right" },
          { header: "LENGTH", align: "right" },
          { header: "NAME", flex: true, minWidth: 20 },
          { header: "PEOPLE", align: "right" },
          { header: "ID" },
        ],
        meetings.map((meeting) => [
          meeting.happenedAt ? formatDateTime(meeting.happenedAt) : "—",
          meeting.happenedAt ? theme.dim(formatRelative(meeting.happenedAt)) : "",
          humanizeDuration(meeting.duration),
          meeting.name,
          String(meeting.invitees.length || "—"),
          theme.dim(meeting.id),
        ]),
      ),
    );

    const shown = meetings.length;
    ctx.out.note(
      total > shown
        ? `${shown} of ${total.toLocaleString()} meetings — use --page or --all for the rest`
        : `${shown} meeting${shown === 1 ? "" : "s"}`,
    );
  });

  return command;
}

/** Exported for the `show` command, which prints the same participant summary. */
export function participantSummary(meeting: Meeting): string {
  return meeting.invitees.map(userLabel).join(", ");
}
