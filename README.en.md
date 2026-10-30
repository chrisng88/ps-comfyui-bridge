# PS ComfyUI Bridge (Auto)

[中文](README.md) | **English**

A Photoshop UXP panel plugin: send the image you are retouching in Photoshop to ComfyUI with one click, and the result is **placed back into the original document automatically** — no manual exporting, app switching, or dragging files back.

```
Open image in PS → click "Send" → plugin exports a JPG and uploads it to ComfyUI
        → ComfyUI processes it with your workflow → plugin polls for the result
        → result is placed back into the same PS document ✅
```

## Features

- **One-click send**: exports the current document as JPG → uploads it to ComfyUI → automatically fills the workflow's `LoadImage` node → submits to the queue
- **Automatic return**: polls for the result in the background (every ~3 seconds, up to ~15 minutes) and places it back into the **original document** (tracked by document ID, so switching to another image in the meantime won't misplace it); if placing fails, the result opens as a new document instead
- **Queue multiple images**: send several documents one after another — each result returns to its own document without overwriting the others
- **Manual fetch**: if a task times out or the panel was reopened, the second button fetches unfinished results manually
- Both the ComfyUI URL and the workflow filename are configurable in the panel — works with a local ComfyUI or a cloud one (e.g. Cloud Studio)

## What you need before starting

| Requirement | Notes |
|---|---|
| Photoshop 24.6+ | UXP plugins do not load on older versions |
| A reachable ComfyUI | A local install, or a cloud URL (e.g. from Cloud Studio). Open it in your browser once — if you see the ComfyUI interface, it works |
| UXP Developer Tool | Adobe's free tool used to load this plugin into Photoshop: [download](https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/) |

> ⚠️ This plugin is loaded **via the UXP Developer Tool** — it is not a double-click `.ccx` installer. The first setup takes a couple of extra steps; follow the guide below.

## Step 1: Download the plugin

1. On this repo page, click the green **Code** button → **Download ZIP**
2. Unzip it
3. Open the extracted folder and check: `manifest.json`, `index.js`, and `index.html` should be right there at this level

> ✅ You know it worked when: you can see `manifest.json` directly in this folder.
> If you have to open one more nested folder to find it, just pick the folder that actually contains `manifest.json` in Step 2.

(Using `git clone` instead works the same way.)

## Step 2: Load the plugin into Photoshop

1. Open the **UXP Developer Tool**
2. Click **Add Plugin** and select the `manifest.json` from Step 1
3. "PS ComfyUI Bridge (Auto)" appears in the list — click **Load** on it (in some versions, Load is under the `···` menu)
4. In Photoshop, open the **Plugins** menu → **ComfyUI Bridge (Auto)**

> ✅ You know it worked when: the plugin panel shows up in Photoshop with two inputs (ComfyUI URL and workflow_api.json) and two buttons.
> Loading fails if Photoshop isn't running — open Photoshop first, then Load.

## Step 3: Make sure ComfyUI is reachable

1. Start your ComfyUI (locally, or make sure the cloud service is running)
2. Open its URL in your browser once — the local default is `http://127.0.0.1:8188`
3. Once the ComfyUI interface loads in the browser, put **the same URL** into the panel's "ComfyUI URL" field (a trailing `/` is fine either way)

> ✅ You know it worked when: you can see the ComfyUI node interface in your browser. If this step fails, everything after it will fail too — don't rush to click Send yet.

## Step 4: Process your first image

1. Open an image in Photoshop
2. Check that the workflow filename in the panel matches a file that actually exists in the plugin folder (for the first run, use the default `workflow_api.json` — see its dependencies under "Example workflows" below; if those aren't set up yet, swap in a workflow you already know works, as described in Step 5, then come back)
3. Click **"1. Export current image and send to ComfyUI"**
4. Watch the status log at the bottom of the panel: exported → uploaded → task submitted → processing
5. Do nothing — when processing finishes, the result is **placed back into this document** as a new layer

> ✅ You know it worked when: the log says the result was placed into the original document, and Photoshop shows a new layer with the processed image.
> You can switch to other images meanwhile — the plugin finds the original document by ID and never places a result into the wrong one.

## Step 5: Add / switch workflows (read this carefully)

Three rules prevent almost every problem:

1. **The file must sit in the plugin root folder** (same level as `index.js`). Files inside `examples/` cannot be used directly — copy them out first
2. **Type only the filename in the panel**, e.g. `my-workflow.json` — not a full path
3. **The workflow JSON must be in API format** (see B for how to export it). A normally saved workflow file will not work

### A. Use a bundled example workflow

1. Copy `examples/ps-ai.json` (or `pc-ai-cloudstudio.json`) into the plugin root folder
2. In the panel's second input, change `workflow_api.json` to `ps-ai.json`
3. Go back to Step 4 and click Send

> Note: the examples depend on specific models and custom nodes (listed below). If your ComfyUI doesn't have them, nodes will error in red — that's an example-dependency issue, not a broken plugin.

### B. Use your own ComfyUI workflow

1. **Run the workflow manually in ComfyUI once** and make sure it produces an image
2. Make sure it contains both of these nodes — the plugin needs them:
   - **LoadImage** — the plugin automatically replaces its image with the one sent from Photoshop; whatever image it currently points to doesn't matter
   - **SaveImage** — the plugin takes the result from this node's output
3. Export in API format: open ComfyUI Settings (gear icon) → enable **Dev Mode** → a **Save (API Format)** button appears; click it to export (in newer UIs it may be under a menu as "Export (API)" — look for the word **API**)
4. Put the exported JSON file into the plugin root folder with a simple name, e.g. `my-workflow.json`
5. Type `my-workflow.json` in the panel's second input, then go back to Step 4 and click Send

> ✅ You know it worked when: the log says the task was submitted, and the task shows up in ComfyUI's queue.
> After replacing or editing a workflow file you do **not** need to reinstall or re-Load the plugin — the file is re-read on every Send.

### How to tell whether an exported file is really API format

Open the JSON in a text editor and look:

- ✅ API format: a list of node IDs, each node containing `"class_type"` (e.g. `"class_type": "LoadImage"`)
- ❌ Regular format: contains words like `"nodes"` and `"links"` — that's a canvas save file the plugin cannot read. Re-export following B, step 3

## Example workflows (examples/)

The repo ships 3 examples, all the same Flux tiled HD-restoration / product-retouch pipeline, provided for reference only — the plugin itself is not tied to any workflow:

| File | Notes |
|---|---|
| `workflow_api.json` (root) | Default example, denoise 0.2 |
| `examples/pc-ai-cloudstudio.json` | Cloud variant, denoise 0.3 |
| `examples/ps-ai.json` | Local variant, denoise 0.3 |

Running these examples as-is requires the following models and custom nodes in your ComfyUI. Missing any of them will error in ComfyUI — these are dependencies of the examples, not of the plugin:

- **Models** (the examples only reference file names; no model files are included in this repo):
  - UNET: `绘梦光影魔术师 F.1 -全能写实-商业电商产品广告摄影_光影全能魔术师_V1.safetensors`
  - VAE: `ae.sft` / `ae.safetensors`
  - CLIP: `t5xxl_fp8_e4m3fn.safetensors` + `clip_l.safetensors`
  - LoRA: `Flux Dev模型4步出图lora_Flux Dev 4-step.safetensors`
  - Upscale model: `4x-AnimeSharp.pth`
- **Custom nodes** (search and install by node name in ComfyUI Manager): `TTP_Image_Tile_Batch` / `TTP_Tile_image_size` / `TTP_Image_Assy`, `LayerUtility: ImageScaleByAspectRatio V2`, `CR Simple Image Compare`, `easy imageBatchToImageList`, etc.
- The prompt in the examples was written for one specific cosmetic product — replace it with your own description for your images

**Tip**: for your first run, use a workflow you already know works (Step 5B) to verify the plugin chain end to end, then explore the examples.

## FAQ

| Symptom | Cause and fix |
|---|---|
| Clicking Send says the workflow file can't be found | The file isn't in the plugin root folder, or the filename in the panel is wrong (including the extension). Check the three rules in Step 5 |
| Upload / submit fails, can't connect | ComfyUI isn't running, or the URL in the panel is wrong. Go back to Step 3 and verify the URL in your browser first |
| Nodes error in red inside ComfyUI | The workflow is missing models or custom nodes. Run the workflow manually in ComfyUI first and install whatever it complains about |
| Log says no LoadImage node found | The workflow has no LoadImage node, or the file isn't API format. Check Step 5B |
| No result comes back for a long time | Polling runs for up to ~15 minutes; long cloud queues can exceed that. The task may still be running in ComfyUI — once it's done, click the panel's second button ("Fetch latest result manually") |
| Result opened as a new document instead of being placed into the original | The original document was closed during processing, or placing failed and the plugin fell back to opening it as a new document — the result is not lost |
| Load fails in the Developer Tool | Open Photoshop before loading; Photoshop older than 24.6 also fails |

## Known limitations

- Exports a flattened JPG of the current document (quality 12), not a layered PSD
- The result is taken from the first workflow node that outputs an image
- Polling runs for up to ~15 minutes; longer cloud queues may time out — use the manual-fetch button afterwards

## License

[MIT](LICENSE)
