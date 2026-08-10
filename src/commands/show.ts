import { Command } from "commander";

import { userLabel } from "../api/normalize.js";
import { createContext } from "../context.js";
import { formatDateTime, formatRelative, humanizeDuration } from "../core/dates.js";
import { resolveMeeting } from "../core/resolve-meeting.js";
import { theme } from "../ui/theme.js";

interface ShowOptions {
  json?: boolean;
  everyone?: boolean;
}

export function showCommand(): Command {
  return new Command("show")
    .description("print one meeting's metadata")
    .argument("<meeting>", "meeting id, tl;dv URL, title, or `latest`")
    .option("--everyone", "search meetings you did not attend when resolving a title")
    .option("--json", "print the raw API payload")
    .action(async (input: string, options: ShowOptions, self: Command) => {
      const ctx = createContext(self);
      const meeting = await resolveMeeting(ctx, input, { onlyParticipated: !options.everyone });

      if (options.json) {
        ctx.out.json(meeting.raw);
        return;
      }

      const rows: [string, string][] = [
        [
          "When",
          meeting.happenedAt
            ? `${formatDateTime(meeting.happenedAt)} (${formatRelative(meeting.happenedAt)})`
            : "unknown",
        ],
        ["Length", humanizeDuration(meeting.duration)],
        ["Organizer", userLabel(meeting.organizer)],
        [
          "Participants",
          meeting.invitees.length > 0 ? meeting.invitees.map(userLabel).join(", ") : "—",
        ],
      ];
      if (meeting.status) rows.push(["Status", meeting.status]);
      rows.push(["Recording", meeting.url]);
      rows.push(["Id", meeting.id]);

      const width = Math.max(...rows.map(([label]) => label.length));
      ctx.out.line(theme.bold(meeting.name));
      for (const [label, value] of rows) {
        ctx.out.line(`${theme.dim(label.padEnd(width))}  ${value}`);
      }
    });
}
