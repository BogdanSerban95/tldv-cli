import { Command } from "commander";

import { UsageError } from "../core/errors.js";

const COMMANDS: [string, string][] = [
  ["ls", "list meetings"],
  ["show", "print one meeting's metadata"],
  ["transcript", "print or save a meeting transcript"],
  ["notes", "print or save a meeting's AI notes"],
  ["download", "download a meeting recording"],
  ["export", "bulk-export to a directory"],
  ["import", "import an external recording"],
  ["auth", "manage the stored API key"],
  ["health", "check the API is reachable"],
  ["completion", "print a shell completion script"],
];

const FORMATS = ["txt", "md", "srt", "vtt", "csv", "json"];

export function completionCommand(): Command {
  return new Command("completion")
    .description("print a shell completion script")
    .argument("<shell>", "bash, zsh, or fish")
    .addHelpText(
      "after",
      [
        "",
        "Install:",
        "  tldv completion zsh  > ~/.zsh/completions/_tldv   # then: fpath+=(~/.zsh/completions)",
        "  tldv completion bash > /etc/bash_completion.d/tldv",
        "  tldv completion fish > ~/.config/fish/completions/tldv.fish",
      ].join("\n"),
    )
    .action((shell: string) => {
      const script = scriptFor(shell.trim().toLowerCase());
      process.stdout.write(script);
    });
}

function scriptFor(shell: string): string {
  switch (shell) {
    case "zsh":
      return zsh();
    case "bash":
      return bash();
    case "fish":
      return fish();
    default:
      throw new UsageError(
        `No completion script for ${JSON.stringify(shell)}.`,
        "Choose bash, zsh, or fish.",
      );
  }
}

function zsh(): string {
  const entries = COMMANDS.map(([name, description]) => `    '${name}:${description}'`).join("\n");
  return `#compdef tldv

_tldv() {
  local -a commands
  commands=(
${entries}
  )

  _arguments -C \\
    '1:command:->command' \\
    '*::arg:->args'

  case $state in
    command) _describe 'tldv command' commands ;;
    args)
      case $words[1] in
        transcript|tr)
          _arguments \\
            '(-f --format)'{-f,--format}'[output format]:format:(${FORMATS.join(" ")})' \\
            '(-o --out)'{-o,--out}'[output path]:path:_files'
          ;;
        notes|download|dl|show)
          _arguments '(-o --out)'{-o,--out}'[output path]:path:_files'
          ;;
        export)
          _arguments \\
            '(-d --out-dir)'{-d,--out-dir}'[destination directory]:dir:_files -/' \\
            '(-f --format)'{-f,--format}'[formats, comma-separated]:formats:'
          ;;
        auth) _values 'subcommand' 'login' 'status' 'logout' ;;
        completion) _values 'shell' 'bash' 'zsh' 'fish' ;;
      esac
      ;;
  esac
}

compdef _tldv tldv
`;
}

function bash(): string {
  const names = COMMANDS.map(([name]) => name).join(" ");
  return `_tldv_completions() {
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  case "$prev" in
    -f|--format) COMPREPLY=( $(compgen -W "${FORMATS.join(" ")}" -- "$cur") ); return ;;
    -o|--out|-d|--out-dir) COMPREPLY=( $(compgen -f -- "$cur") ); return ;;
    auth) COMPREPLY=( $(compgen -W "login status logout" -- "$cur") ); return ;;
    completion) COMPREPLY=( $(compgen -W "bash zsh fish" -- "$cur") ); return ;;
  esac

  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${names}" -- "$cur") )
  else
    COMPREPLY=( $(compgen -W "--json --quiet --help --everyone --from --to --limit" -- "$cur") )
  fi
}

complete -F _tldv_completions tldv
`;
}

function fish(): string {
  const lines = COMMANDS.map(
    ([name, description]) =>
      `complete -c tldv -n __fish_use_subcommand -a ${name} -d '${description.replace(/'/g, "")}'`,
  );
  lines.push(
    `complete -c tldv -n '__fish_seen_subcommand_from transcript tr' -s f -l format -x -a '${FORMATS.join(" ")}'`,
    "complete -c tldv -n '__fish_seen_subcommand_from transcript tr notes download dl' -s o -l out -r -F",
    "complete -c tldv -n '__fish_seen_subcommand_from auth' -a 'login status logout'",
    "complete -c tldv -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish'",
  );
  return `complete -c tldv -f\n${lines.join("\n")}\n`;
}
