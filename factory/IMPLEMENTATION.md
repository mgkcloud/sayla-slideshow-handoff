# Local factory implementation

Supported entrypoint: `generate-slides.js`. JSON input is validated against the local-only contract; backgrounds are decoded locally and text is wrapped/positioned on a 1080×1920 canvas. DejaVu Sans Bold is bundled under its included licence. Each hook becomes one PNG. Captions and SHA-256 manifests are written with the draft.

Outputs must be new direct children of `factory/drafts/`. Static root/nested symlinks and path escapes are rejected. A temporary staging directory is renamed only after all outputs succeed; failure removes staging and overwrite attempts fail. Concurrent hostile filesystem-swap races are outside the verified threat model.

Run `npm test` for ten regression cases: real offline rendering/hashes/dimensions; overwrite refusal; network URL rejection; malformed input/IDs/controls; missing/corrupt backgrounds; text overflow; forbidden network/publishing imports; nested and root symlink rejection; and an explicitly source-injected second-image-write cleanup fault. The last case is synthetic fault injection, not a real provider failure.

`npm run demo` uses the three supplied configs and backgrounds. It does not call an image model, upload, schedule or post. Installation needs npm access; rendering does not. The historical scripts in `archive/source/` are not imported.

The public copy removes owner-host provenance paths from example metadata while preserving source hashes and imagery. Public release verification is recorded separately; no private credentials or original host are required.
