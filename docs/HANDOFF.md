# Employee handoff

Everything needed to read the project, run the local factory, edit it and review the existing generations is public in this repository or its linked media. No invitation or owner account is needed.

## Start

```bash
git clone https://github.com/mgkcloud/sayla-slideshow-handoff.git
cd sayla-slideshow-handoff/factory
npm ci
npm test
npm run demo
```

Use Node.js 20 or newer. Installation fetches public npm packages; rendering requires no network, API key, database, cloud account or original workstation. The DejaVu font/license, three backgrounds, scripts, schema and regression tests are included.

The demo writes three sets under `factory/drafts/`, with nine 1080×1920 PNGs, captions and manifests. It refuses existing output directories. Change the example output_dir to a new direct child of `factory/drafts/` for a new run; do not delete originals to force a rerun.

## Work on a script

Copy one of `factory/examples/*.json`. Each `hooks` entry makes one slide; each item in its `text` array is a separate line. Use `client: "sayla"`, a nonempty caption and local background_images inside `factory/`. Remote URLs, traversal, duplicate/unsafe IDs, corrupt images and overflowing text fail visibly. See [schema](../factory/slides-config.schema.json) and [implementation](../factory/IMPLEMENTATION.md).

```bash
node generate-slides.js examples/my-script.json
```

## Browse and source assets

- [Public viewer](https://gnn.fy.studio/sayla-slideshow-guide/v1/index.html): version selector, ordered images, exact copy and source links.
- [Gallery](GALLERY.md) and [versions/tools](VERSIONS.md): compare formats before changing a renderer.
- [Full-resolution download manifest](../assets/full-resolution.json): public URLs, dimensions and hashes for every selected image.
- [Exact recovered copy](../catalogue/copy.json) and [historical scripts/configs](../archive/source/).
- `examples/historical/` contains the recovered w1/w2/w3 configuration and comic briefs/prompts. Prompt-only work is not a rendered output.

Use the three bundled backgrounds for a no-account start. More full-resolution generated backgrounds are linked publicly; download an appropriate raw image into `factory/assets/` before rendering. No private reference photos are required for the working local factory.

## View/edit the website locally

From the repo root:

```bash
python3 -m http.server 8765 --directory walkthrough
```

Open http://localhost:8765/. No framework/build step is needed. Edit index.html/app.js/styles-plain-v3.css; data.json is the public catalogue. Keep image order within sets. The version list is reversed and omits empty sets. Source links must remain anonymously readable.

## Choose the right implementation

The local Canvas factory is tested, but deliberately simple. The historical native iMessage/lock-screen system, listicles, photorealistic batches and other variants are distinct. Their source snapshots are inert `.txt` references, not drop-in execution scripts. Some historical tools depend on missing/uncleared fonts, original reference images, host paths or paid providers. Those are documented limits, not a reason to silently substitute another generator.

Start with a representative output, identify its exact source/config and make the smallest change in an isolated branch. Do not execute archived provider/posting code or infer that an old dry-run is free. No historical native rerender or model call is authorized by this handoff.

## Done means

- A clean checkout installs and tests successfully.
- Actual ordered images, caption and manifest exist, with matching hashes and correct dimensions.
- Images are readable without cropping; missing copy is not fabricated.
- All required code/docs/assets resolve without a private-repo login.
- No social posting, scheduling or paid generation is introduced.

Production hosting credentials remain owner-managed and are not needed to develop or run this draft tool. Share changes as a patch or fork; public reading/downloading does not grant write access to the owner's repository or cloud account.
