# ClearMark Ai

An independently authored, local image and short-video editor. This is a plain static site with no build dependencies and no media-upload endpoint. All files in `dist/` are authored source and must stay tracked.

## Product scope

- PNG/JPEG/WebP inputs; PNG export at original dimensions unless cropped.
- Browser-decodable MP4/WebM/MOV input, up to 90 seconds and 250 MB.
- Video exports use native Canvas/MediaRecorder, prefer MP4 when the browser supports it, and otherwise use WebM. They are re-encoded up to 30 fps and 1920 pixels on the longest side; audio is routed through Web Audio and re-encoded when decodable.
- One fixed rectangular selection with Gemini, Veo, Omni, and Custom starting positions. Presets are not automatic model/watermark recognition.
- Boundary blending, nearby patch copying, and nearest-edge cropping.
- Original/result preview, an interactive comparison slider, selection dragging/resizing, keyboard and numeric adjustments, error states, progress, and cancellable exports.
- No model API, credentials, third-party scripts, external fonts, trackers, subscriptions, or server-side image processing.

## Technical limits

The fill uses a Coons surface estimated from the four boundaries. It can reconstruct simple gradients but can soften or misrepresent textured regions. Clone mode copies a patch without overlap; crop mode removes the selected area by trimming the closest edge. Neither fill nor clone recovers unknown hidden detail. The editor does not include an alpha template for any Gemini/Veo/Omni version.

The same fixed area is edited on each video frame. There is no moving-logo tracking or temporal inpainting. Keep the browser tab visible: hiding it cancels recording instead of knowingly delivering a throttled/incomplete output. The downloaded video must be reviewed for artifacts and audio. Browser codec support and performance vary; UI checks capabilities but cannot guarantee every source codec or device. Silent sources may produce a silent audio track. Exports do not promise to retain metadata or C2PA credentials, and do not detect or intentionally remove invisible watermarks.

## Reference analysis 

Reference: https://ishara-madu.github.io/gemini-watermark-remover/

| Reference finding | Product decision |
|---|---|
| Separate image and video workflows with upload, tuning, preview, and local export | Keep the useful workflow, with a compact three-step working surface |
| Multiple position/gain/scale sliders and zoomed corner previews | Use a direct draggable box and optional numeric controls |
| Gemini/Veo-specific mathematical alpha unblending | Use independent, general region-editing methods; state their limits clearly |
| Repeated marketing sections and broad lossless/original-quality claims | Put the editor first and avoid unsupported restoration guarantees |
| Repository declares MIT licensing | No reference code or assets are reused, so no license-derived code dependency |
| Visible/invisible watermark discussion | Explicitly limit this editor to visible marks; do not claim SynthID removal or preservation |

### Quality claim assessment

The inverse alpha equation requires the correct logo, alpha values, pixel location, color space, and unmodified composited data. If a pixel is opaque, information about its underlying value is absent. Rounding, recompression, resizing, or an inaccurate mask also prevent a general guarantee of exact recovery. These are mathematical constraints, not evidence that the reference fails for every input. No functional or visual browser testing of the reference was performed; the analysis uses its published page and repository documentation.

### Copyright and branding

Copyright generally protects original expression rather than the underlying idea or method. This project has its own code, visual layout, copy, abstract practice canvas, and generic interface symbols. It does not import the reference's screenshots, CSS, JavaScript, watermark assets, or logos. This reduces copying concerns; it is not an assurance of zero legal risk. The product name is provisional and has not undergone trademark clearance. Users must own the content or have editing permission and comply with the source service's terms. Removing a mark does not confer ownership or a license to the media.

Primary sources reviewed:

- Reference site: https://ishara-madu.github.io/gemini-watermark-remover/
- Reference repository and its MIT declaration: https://github.com/ishara-madu/gemini-watermark-remover
- License page: https://github.com/ishara-madu/gemini-watermark-remover/blob/main/LICENSE
- WIPO, copyright protection and idea/expression distinction: https://www.wipo.int/en/web/copyright/protection
- Google DeepMind, SynthID: https://deepmind.google/models/synthid/
- MDN, canvas capture: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream
- MDN, runtime recording type support: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static

## Validation

JavaScript syntax and static entrypoints/assets are checked before publishing. Deterministic pixel checks cover gradient repair, outside-selection preservation, transparency, source-patch copying, non-overlapping crop bounds, and bounded even video dimensions. Browser playback, codec encoding, download behavior, and visual QA are not end-to-end verified in this environment.

## Portable package

The `dist/` folder contains the complete editable website. See `START_HERE.txt`
for local preview and hosting instructions. `start_server.py` provides a local
server using Python 3 and no extra packages. The original private Site identity,
Git history, and credentials are intentionally excluded from this export.
