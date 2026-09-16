---
name: filedrop
description: >
  Share files quickly between machines/agents with end-to-end encryption, no
  account. Use when one agent must hand a file (or arbitrary text) to another
  machine/agent, or when you need to fetch a file by an access code + secret
  word. Triggers: filedrop, share a file, send this file to another agent or
  box, upload then send a download link, download by access code, E2E file
  drop, "give agent X this file". Requires the `filedrop` CLI (see below).
---

# Filedrop

End-to-end encrypted, no-account file sharing. Upload a file (or text), get a
one-line download command; run that line on any other box to fetch the file.
AES-256; the server never sees plaintext. A share = one **access code** + one
**secret word** — either alone is useless. Files live for a TTL.

## Setup (once, if `filedrop` is not on PATH)

```bash
command -v filedrop >/dev/null && echo "installed" || {
  R=/home/omarchy/Projects/filedrop   # repo checkout
  mkdir -p ~/.local/bin
  ln -s "$R/filedrop" ~/.local/bin/filedrop
}
```

Needs `openssl`, `curl`, `python3`. No build step.

## Upload (agent: always pass --yes)

`--yes`/`-y` skips the interactive y/N prompt. **Non-interactive (piped stdin,
no TTY) skips the prompt automatically**, so agents are safe either way — but
pass `--yes` to be explicit and avoid a hang if a TTY is present.

```bash
filedrop ./photo.jpg --yes
filedrop ./report.pdf --secret myword --yes    # fixed secret (easy to relay)
echo "hello" | filedrop - --yes                 # stdin; saved as a .txt name
# Capture just the download line (nothing else on stdout):
cmd=$(filedrop ./report.pdf --yes --copy)   # -> 'filedrop download <code> <secret>'
```

stdout looks like:

```
Access code: 6e6c
Secret word: some-word

Copy-paste to download elsewhere:
  filedrop download 6e6c some-word
```

Relay that `filedrop download …` line to the receiver, or parse the code+secret.

## Download

```bash
filedrop download 6e6c some-word --out ./photo.jpg
```

- `--out <path>`: where to save. Parent dirs are created. Omit → `filedrop-<code>.<ext>` in the current dir.
- Prints `Saved to <path>`; exit 0 on success, non-zero on failure.
- Same `--url <base>` must be used on both sides if not the default server (`https://fd.up.railway.app`).

## Agent flow (full round trip)

1. `filedrop <file> --yes` → capture the "Copy-paste to download elsewhere:" line.
2. Send that line to the receiving agent/box.
3. Receiver: run the line as-is, or `filedrop download <code> <secret> --out <dest>`.

## Notes / gotchas

- Large files are fine — the CLI streams and the server caps uploads at ~500 MiB, 20/min/IP.
- Wrong/missing secret → "Unable to decrypt" (exit ≠ 0). Expired/consumed → HTTP 410.
- `filedrop --help` prints full agent-facing docs.
- This box's `bash` does not match `[[ == [yY] ]]` bracket globs; the CLI uses `case` for the confirm decision — don't "fix" it back.