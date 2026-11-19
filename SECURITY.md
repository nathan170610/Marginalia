# Security

Orrery is local-first. Your notes are plain files on your disk, and nothing is uploaded by Orrery itself.

## Threat model
| Surface | Risk | Mitigation |
|---|---|---|
| **Note files → Claude (MCP)** | A note (including imported conversations or copied web text) can contain instructions such as "ignore previous instructions and…". This is **prompt injection**. | Note text is *data*, not instructions. Tool results are plain text, and the server's instructions tell Claude that notes are the user's memory. Review imported content; never import files you don't trust. |
| **Local HTTP server (`orrery serve`)** | Other websites in your browser could try to POST to `127.0.0.1:4747`. | Binds to 127.0.0.1 only. POSTs carrying a foreign `Origin` are refused (403). |
| **Path traversal** | A note id like `../../etc/passwd`. | `safeNotePath` rejects any path outside the vault (tested). |
| **XSS in note rendering** | Markdown containing `<script>` or attributes. | The renderer escapes all HTML before applying its tiny markdown subset. Desktop app: CSP `script-src 'self'`, sandboxed renderer, `contextIsolation`, navigation and new windows blocked. |
| **IPC surface** | The renderer can call only: graph, note, search, write, remember, settings, setup-claude, change-vault, open-vault. | Every file write goes through `safeNotePath`. Changing the vault and setting up Claude need a native dialog or an explicit button press. |
| **Claude Desktop config** | `setup-claude` edits `claude_desktop_config.json`. | Shows the change first (CLI), keeps other servers and writes a timestamped backup. |
| **Auto-update** | Malicious update. | Only from this repo's GitHub Releases over HTTPS. Sign releases (see `docs/RELEASE_CHECKLIST.md`). |

## Reporting
Please open a private security advisory on GitHub (Security → Report a vulnerability) rather than a public issue.
