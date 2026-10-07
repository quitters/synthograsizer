# Designing an image-prompt engine

An **engine** is a prompt template (no `p5Code`) with enough depth that every random draw is a different, coherent, striking image.
The eight that ship (Lost Cinema, Tape Shelf, Impossible Objects, Civic Notices, Arcade Archaeology, Brutalist Utopias, Arcana Machina,
Specimen Plates) are small invented archives: stills from films that do not exist, covers of tapes nobody released. This page is the method
behind them, written down so the next one starts from what worked. The format itself is in [SCHEMA.md](SCHEMA.md).

## The shape

- One sentence with `{{placeholders}}` that stays grammatical for every combination and fills to under about 60 words.
- 5 or 6 variables, 8 to 12 values each, weights 3 / 2 / 1 for common / uncommon / rare (roughly four of each in a list of twelve).
- Values are concrete visual phrases of two to eight words that an image model can draw and that read naturally inside the sentence.

## Bundle what depends on each other

Random draws go wrong when two variables must agree and do not. Lost Cinema has no separate "country", "year" and "film stock" variables: its
`film` variable is *"a 1966 Czech new-wave comedy in saturated colour"*, which carries all three, so the draw cannot pair 1926 with colour video.
Keep things that are independent (scene, framing, lighting, damage) as separate variables so the draws vary along each.

## Prompt hygiene (found by looking at the first renders)

| Problem | Fix, now in the shipped prompts |
|---|---|
| The model stamps archival captions and **real titles** on "film stills" | end the template with "no captions, titles or lettering anywhere in the frame" |
| Background shelves and rows fill with real film, game and brand names | "any other tapes in view are unlabelled generic cases with blank spines" |
| A value ending in "Union" or "Lodge" makes the model print a banner or crest | phrase organisations as trades ("slate-quarry blasters"), not institutions |
| Real people, living artists, copyrighted characters | describe the style instead of naming the artist; invent studios and nations |

Where lettering *is* the point (Civic Notices, Arcana Machina, Impossible Objects), the model renders invented slogans, card titles and museum labels
cleanly, so do not suppress it there.

## Judge on a contact sheet before you install

Draw 12 images, build a contact sheet, and look at it before anything else. Cost is about $0.80 on `gemini-3.1-flash-image`. What to look for: draws that
contradict themselves (a bundling problem), the same composition in every draw (a variable that does not vary), text where there should be none, and
real names. Fix the prompt, redraw. Do not hand-pick images from a larger batch to hide a weak template: the template is the product.

## Decks and series

To get a set that matches (22 cards, a season of posters), hold every variable constant and cycle one. Arcana Machina's `arcanum` variable has 22 values,
one per major arcanum, for exactly this.

To hold the *look* across the set, send one good card as a `style` reference (the typed reference slots on `gemini-3.1-flash-image`). A bare reference
transfers its **subject** too: in a 22-card test the reference's steam-engine and numeral appeared in most cards. Add a look-only clause:

> Use the attached reference image only for its border, foil finish, palette and lettering style. Draw an entirely new subject for this card; do not
> reuse the reference's machinery, composition, star or numeral.

In a workflow this is the `look_locked_deck` template (`workflow-engine/workflowTemplates.js`): `synth_image` takes `references: {style: [ids]}` and adds the clause itself. A style reference still leaks a little (a ghost lighthouse in a card about a camera in fog) so look at the set.

With that clause the 22 cards shared the frame and finish and had 22 different subjects. Without any reference the look held from the text alone but the
framing drifted (some cards came back photographed in a hand).

## Check and install

1. Save as `static/synthograsizer/templates/<slug>.json` (`promptTemplate`, `variables`, optional `tags`).
2. Add a button under `data-category="PROMPT"` in `static/synthograsizer/index.html`.
3. Add the slug to `ENGINES` in `tests/test_template_contract.py`. It checks that every placeholder has a variable and the reverse, 5 to 9 variables,
   at least six unique weighted values each, a clean filled prompt, and a picker button.
