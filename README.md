# Sayla slideshow handoff

**[Open the slideshow viewer](https://gnn.fy.studio/sayla-slideshow-guide/v1/index.html)** · **[Start here](docs/HANDOFF.md)**

Public code, setup instructions, historical source/templates and generated assets for the Sayla slideshow project. No GitHub login or invitation is needed to read or clone this handoff.

```bash
git clone https://github.com/mgkcloud/sayla-slideshow-handoff.git
cd sayla-slideshow-handoff/factory
npm ci
npm test
npm run demo
```

The local factory turns a JSON script and local backgrounds into ordered PNGs, a caption and a hash manifest. Nothing posts or schedules. Fonts, backgrounds, sample scripts and tests are included; rendering needs no API key or original host.

Verified on the staged public copy: dependency install passed, **10/10 tests passed**, and the network-blocked demo produced **three sets / nine 1080×1920 PNGs** with matching captions/manifests. [Receipt](verification/runtime.json).

Maintained factory code is [MIT licensed](factory/LICENSE); historical snapshots and creative/media are outside that grant. [Scope](LICENSE.md).

## Files

- [Employee instructions](docs/HANDOFF.md): setup, editing, output contract and next work.
- [Versions and tools](docs/VERSIONS.md): distinct historical formats and their source snapshots.
- [Hooks and styles](docs/HOOKS-AND-STYLES.md): recovered copy, without invented missing text.
- [Gallery](docs/GALLERY.md): public previews and full-resolution downloads.
- [Historical source](archive/source/): inert generator/template/configuration references.
- [Recovered iOS-style renderer](docs/NATIVE-RECOVERY.md): source/output present; native rerender still unverified.
- [Asset download manifest](assets/full-resolution.json): public full-resolution review URLs and hashes.
- [Safety and rights](docs/SAFETY-AND-RIGHTS.md): public scope and explicit exclusions.

The viewer has 12 media-bearing versions and 479 generation contexts, sharing 452 unique previews. Images/copy remain grouped by their own versions. Source paths in the public copy are sanitized; originals and internal history are not needed for the supported local workflow.

Historical source is not automatically runnable. Paid-provider engines, proprietary fonts and uncleared reference inputs need separate setup/review; only the `factory/` runtime is the supported no-account entrypoint. This public handoff does not expose production credentials or grant advertising-use rights.
