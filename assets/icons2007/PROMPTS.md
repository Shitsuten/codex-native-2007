# Codex Native 2007 icon set

Generation mode: built-in `image_gen`

Style reference: a user-provided screenshot of a 2007-era Chinese desktop IM client.
Reference role: style and palette only, not an edit target and not redistributed.

## Shared prompt

Create one 32×32 desktop UI icon master for a Codex Native 2007 skin. Match the
tiny glossy early-2000s Chinese instant-messenger toolbar icon language:
crisp hand-pixelled art, chunky silhouette, restrained Windows XP-era
highlights, dark navy one-pixel-looking outline, and minimal internal detail.
The icon must remain legible at 16–18 px and must not look like a modern flat
vector. Center exactly one icon with even padding and no frame, text, watermark,
extra objects, cast shadow, or reflection.

Use a perfectly flat solid `#ff00ff` chroma-key background with no gradient,
texture, floor plane, or lighting variation. Do not use `#ff00ff` inside the
icon.

## Subject variants

- `new-task`: white document, pale-blue folded corner, blue pen, yellow sparkle.
- `scheduled`: silver and pale-blue alarm clock, white face, blue and coral hands.
- `plugins`: three connected glossy nodes in lime, sky blue, and warm yellow.
- `project-folder`: slightly open golden-yellow classic desktop folder.
- `quick-chat`: overlapping lemon-yellow and icy-blue speech bubbles.
- `attach`: thick silver paperclip with pale-blue metallic highlight.
- `pull-requests`: two silver-blue documents joined by a branching merge arrow.
- `sites`: tiny browser window with a blue-green globe and golden sparkle.
- `search`: glossy magnifying glass with an icy-blue lens and silver rim.
- `help`: pale-blue circular help badge with a navy question mark.

## Post-processing

The generated masters were keyed with `remove_chroma_key.py`, cropped to their
opaque bounds, optically centered, and resized with nearest-neighbour sampling
onto transparent 64×64 PNG canvases. CSS renders them at 16–18 px with
`image-rendering: pixelated`.
