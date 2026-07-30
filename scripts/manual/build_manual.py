"""Build the Synthograsizer Suite user manual PDF from captured screenshots."""
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Image,
                                PageBreak, Table, TableStyle, KeepTogether)
from PIL import Image as PILImage

SHOTS = Path(__file__).parent / "shots2"
OUT = Path(__file__).parent / "Synthograsizer-Manual.pdf"

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

INK = colors.HexColor("#2b2b33")
TEAL = colors.HexColor("#00695c")
MUTED = colors.HexColor("#5a5a66")
RULE = colors.HexColor("#d8d4cc")

ss = getSampleStyleSheet()
S = {
    "title": ParagraphStyle("title", parent=ss["Title"], fontName="Helvetica-Bold",
                            fontSize=30, leading=35, textColor=INK, spaceAfter=6),
    "subtitle": ParagraphStyle("subtitle", parent=ss["Normal"], fontName="Helvetica",
                               fontSize=12.5, leading=17, textColor=MUTED, spaceAfter=20),
    "h1": ParagraphStyle("h1", parent=ss["Heading1"], fontName="Helvetica-Bold",
                         fontSize=19, leading=23, textColor=TEAL, spaceBefore=4, spaceAfter=9),
    "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold",
                         fontSize=13, leading=17, textColor=INK, spaceBefore=13, spaceAfter=5),
    "body": ParagraphStyle("body", parent=ss["Normal"], fontName="Helvetica",
                           fontSize=10.2, leading=15.2, textColor=INK, spaceAfter=8,
                           alignment=TA_LEFT),
    "caption": ParagraphStyle("caption", parent=ss["Normal"], fontName="Helvetica-Oblique",
                              fontSize=8.8, leading=12, textColor=MUTED, spaceBefore=5,
                              spaceAfter=14),
    "note": ParagraphStyle("note", parent=ss["Normal"], fontName="Helvetica",
                           fontSize=9.4, leading=13.5, textColor=INK,
                           leftIndent=8, rightIndent=8, spaceBefore=5, spaceAfter=11,
                           borderPadding=7, backColor=colors.HexColor("#f2efe8")),
    "cell": ParagraphStyle("cell", parent=ss["Normal"], fontName="Helvetica",
                           fontSize=9.3, leading=13, textColor=INK),
    "cellb": ParagraphStyle("cellb", parent=ss["Normal"], fontName="Helvetica-Bold",
                            fontSize=9.3, leading=13, textColor=INK),
}


def shot(name, caption, width_frac=1.0):
    """Place a screenshot scaled to the text column, with its caption."""
    p = SHOTS / f"{name}.png"
    if not p.exists():
        return [Paragraph(f"[missing screenshot: {name}]", S["caption"])]
    iw, ih = PILImage.open(p).size
    w = CONTENT_W * width_frac
    h = w * ih / iw
    max_h = 118 * mm
    if h > max_h:
        h = max_h
        w = h * iw / ih
    img = Image(str(p), width=w, height=h)
    img.hAlign = "CENTER"
    return [img, Paragraph(caption, S["caption"])]


def table(rows, widths):
    data = [[Paragraph(c, S["cellb"] if i == 0 else S["cell"]) for c in row]
            for i, row in enumerate(rows)]
    t = Table(data, colWidths=widths, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ece8e0")),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, RULE),
        ("LINEBELOW", (0, 1), (-1, -2), 0.35, colors.HexColor("#eae7e0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return [t, Spacer(1, 12)]


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    if doc.page > 1:
        canvas.drawString(MARGIN, 11 * mm, "Synthograsizer Suite — User Manual")
        canvas.drawRightString(PAGE_W - MARGIN, 11 * mm, str(doc.page))
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.4)
        canvas.line(MARGIN, 15 * mm, PAGE_W - MARGIN, 15 * mm)
    canvas.restoreState()


st = []
P = lambda t, s="body": st.append(Paragraph(t, S[s]))

# ── Cover ───────────────────────────────────────────────────────────────────
st.append(Spacer(1, 42 * mm))
P("Synthograsizer Suite", "title")
P("A user manual for the prompt instrument, its studios, and the tools around them.", "subtitle")
st.extend(shot("01-perform-first-run", "Perform mode — what you see the first time you open the app."))
P("This manual covers a <b>local install</b>, which has every feature switched on. "
  "The hosted service at synthograsizer.com is the same app with the local-only tools "
  "hidden — each section says which is which.", "note")
st.append(PageBreak())

# ── Contents ────────────────────────────────────────────────────────────────
P("What's in here", "h1")
st.extend(table([
    ["Section", "What it covers"],
    ["1 · The idea", "What a template is, and why the app is built around variables"],
    ["2 · Three modes", "Perform, Studio and Composer, and when to use each"],
    ["3 · Templates", "Choosing one, and what the picker tells you"],
    ["4 · Variables", "Knobs and D-Pad, and driving them from the keyboard"],
    ["5 · The prompt", "Randomize, Generate, Copy, Like, Run Code"],
    ["6 · AI Studio tools", "The four menus and every tool under them"],
    ["7 · Workflows", "Multi-step chains, and what they cost"],
    ["8 · Live output", "The p5.js canvas and the Display window for OBS"],
    ["9 · Connections", "MIDI, Scope, Display and the API key"],
    ["10 · Settings", "API key, backend tier, safety, themes"],
    ["11 · Keyboard reference", "Every shortcut in one table"],
], [42 * mm, CONTENT_W - 42 * mm]))
st.append(PageBreak())

# ── 1 ───────────────────────────────────────────────────────────────────────
P("1 · The idea", "h1")
P("Synthograsizer treats a prompt as an <b>instrument</b> rather than a piece of text. "
  "You load a <b>template</b> — a sentence with slots in it — and each slot becomes a "
  "<b>variable</b> you can turn like a knob. Changing a knob rewrites that part of the "
  "sentence instantly.")
P("The payoff is that you stop retyping prompts. Once a template is loaded you explore "
  "by turning knobs, and every combination is one gesture away. A template with 13 "
  "variables of 6 values each is a space of several million prompts you can walk through "
  "by feel.")
P("Templates come in two kinds. <b>Prompt templates</b> produce text for an AI image or "
  "video model. <b>p5.js templates</b> also carry a generative-art sketch that reads the "
  "same variables live, so turning a knob changes the artwork on screen as well as the "
  "words.")
st.append(PageBreak())

# ── 2 ───────────────────────────────────────────────────────────────────────
P("2 · Three modes", "h1")
P("The three buttons at the top left switch how much of the app is on screen. Your work "
  "is not affected by switching — it is the same session throughout.")
st.extend(table([
    ["Mode", "What it is for"],
    ["Perform", "Live use. Large controls, minimal chrome, the output text big enough to read "
                "from across a room. The Studio tools are deliberately hidden."],
    ["Studio", "The workbench. Everything Perform has, plus the AI Studio tool menus in the "
               "top bar and the Connections strip."],
    ["Composer", "Builds a crew of AI agents, in three numbered steps: pick personas from the "
                 "<b>Library</b>, adjust them in the <b>Editor</b>, then run them together in a "
                 "<b>Session</b>."],
], [26 * mm, CONTENT_W - 26 * mm]))
st.extend(shot("03-studio-mode", "Studio mode. The tool menus (Generate, Transform, Automate, Inspect) sit in the top bar."))
st.append(PageBreak())
st.extend(shot("16-perform-mode", "Perform mode. Same session, less chrome — built for playing live rather than building."))
st.extend(shot("15-composer-mode",
               "Composer mode, step 1 — the agent profile library. Each card is a persona with its "
               "own brief; the numbered tabs across the top run Library, Editor, Session."))
P("Composer and Agent Studio are two doors to the same idea. Agent Studio drops a "
  "ready-made panel of agents into the Studio; Composer is where you assemble and tune "
  "the crew before running it.")
st.append(PageBreak())

# ── 3 ───────────────────────────────────────────────────────────────────────
P("3 · Templates", "h1")
P("Click <b>TEMPLATES</b> at the bottom of the prompt area, or the template name in the "
  "top bar, to open the picker. The arrows either side of the TEMPLATES button step to "
  "the previous or next template without opening anything.")
P("Each card shows the template's name, its type (P5 or PROMPT), and how many variables "
  "it has — the variable count is a good proxy for how much there is to explore. The "
  "filter chips across the top narrow the list to P5.JS, PROMPT, STORY or MUSIC.")
st.extend(shot("02-templates-picker", "The template picker. Around 50 built-in templates, filterable by type and searchable by name."))
P("Loading a template replaces what is currently loaded. If you have edited a template "
  "and not saved it, export it first — <b>Settings  Export Template</b>, or the CODE "
  "button above the prompt.", "note")
st.append(PageBreak())

# ── 4 ───────────────────────────────────────────────────────────────────────
P("4 · Variables — knobs and D-Pad", "h1")
P("The panel on the right is the same set of variables shown two ways. The <b>Knobs</b> "
  "view puts every variable on screen at once, which suits building. The <b>D-Pad</b> "
  "view shows one variable at a time in a much larger readout, which suits performing "
  "where you need to read it at a glance.")
st.extend(shot("04-knobs", "Knobs view — every variable at once. The coloured pill under each knob is its current value."))
st.extend(shot("05-dpad", "D-Pad view — one variable, large. The dots underneath show your position in the list."))
P("<b>From the keyboard:</b> the Left and Right arrow keys step the selected variable "
  "through its values; Up and Down move between variables. This works anywhere in the app except while you are "
  "typing in a text field or while a dialog is open.")
st.append(PageBreak())

# ── 5 ───────────────────────────────────────────────────────────────────────
P("5 · Working with the prompt", "h1")
P("The generated prompt sits in the panel on the left, with each variable's contribution "
  "highlighted in its own colour so you can see which knob controls which words.")
st.extend(table([
    ["Control", "Key", "What it does"],
    ["RANDOMIZE", "R", "Rolls every variable to a random value at once."],
    ["GENERATE", "G", "Sends the current prompt to the image model and shows the result."],
    ["TEMPLATE GEN", "T", "Writes a brand-new template with AI, from a description or an image."],
    ["RUN CODE", "P", "Runs the template's p5.js sketch in the canvas panel."],
    ["COPY", "C", "Copies the finished prompt to the clipboard."],
    ["LIKE", "F", "Saves this exact combination to Liked Prompts so you can return to it."],
    ["CODE", "—", "Opens the template's JSON and sketch source for editing or export."],
    ["PROMPT BATCH", "—", "Steps through many variable combinations and collects the results."],
], [32 * mm, 14 * mm, CONTENT_W - 46 * mm]))
st.append(PageBreak())

# ── 6 ───────────────────────────────────────────────────────────────────────
P("6 · The AI Studio tools", "h1")
P("In Studio mode the top bar carries four menus. Everything the app can do with AI is "
  "in one of them, and the big buttons below are fast paths to the most-used items.")
st.extend(table([
    ["Menu", "Tools"],
    ["GENERATE", "Image Studio · Video Studio* · Music Studio*"],
    ["TRANSFORM", "Smart Transform · Glitcher Studio · Image Analysis"],
    ["AUTOMATE", "Workflows · Agent Studio · AI Chat"],
    ["INSPECT", "Metadata · Trace Viewer"],
], [30 * mm, CONTENT_W - 30 * mm]))
P("* Video and Music generation are <b>local-install only</b>. On the hosted service they "
  "are hidden, because a single video clip can cost more than a month of everyone else's "
  "text generation.", "note")

P("Image Studio", "h2")
P("Generates an image from the current prompt. You choose the model, the aspect ratio and "
  "how much the model should think before drawing. Results appear in the AI Studio Output "
  "panel with Download and — when signed in — Save buttons.")
st.extend(shot("06-image-studio", "Image Studio. Model, aspect ratio and reference images are all set before you run."))
st.append(PageBreak())

P("Smart Transform", "h2")
P("Takes an image you already have and restyles it, optionally guided by a second "
  "reference image. Point it at one picture and one style and it does a single "
  "transform; give it several styles and it produces a matrix of the same subject in "
  "each. The Run button quotes the cost before you press it.")
st.extend(shot("07-smart-transform", "Smart Transform. 'Match input' keeps the original aspect ratio rather than forcing a square."))

P("Glitcher Studio", "h2")
P("The full Glitch Art Studio, embedded. Pull in the latest Image Studio output or a live "
  "frame from the p5.js canvas, apply pixel-level effects, and send the result back to the "
  "output or save it.")
st.extend(shot("11-glitcher-studio", "Glitcher Studio, opened over the main app."))
st.append(PageBreak())

P("Agent Studio", "h2")
P("A panel of AI agents with distinct personalities that discuss your work. Send a "
  "generated image in for critique and they will respond with suggestions — and with "
  "image prompts you can run straight back through the studio.")
st.extend(shot("10-agent-studio", "Agent Studio. Each agent has its own brief, so their critiques differ on purpose."))
st.append(PageBreak())

# ── 7 ───────────────────────────────────────────────────────────────────────
P("7 · Workflows", "h1")
P("A workflow is a chain of steps run for you: generate an image, analyse it, rewrite the "
  "prompt from what was found, generate again. There are 17 built in, from single-purpose "
  "ones like Style Transfer to longer chains like Card Style Kit, which produces the "
  "reusable pieces of a styled playing-card deck.")
st.extend(shot("08-workflows-grid", "The workflow library. Each card names the chain and summarises what it produces."))
P("Pick a workflow and you are asked for its inputs before anything runs. A run can be "
  "stopped part-way with <b>Stop run</b>, and whatever finished stays available under "
  "<b>View results</b> — including after you close and reopen the panel.")
st.extend(shot("09-workflow-params", "A workflow's inputs, collected before the run starts."))
P("<b>Local installs</b> run workflows on the ChatRoom server, which must be started "
  "separately — use <i>launch-all.bat</i>, or <i>npm start</i> inside <i>chatroom/</i>. If it "
  "is not running the panel says so and offers a retry. <b>On the hosted service</b> "
  "workflows run in your browser instead and need no extra server; the three that generate "
  "video are shown locked.", "note")
st.append(PageBreak())

# ── 8 ───────────────────────────────────────────────────────────────────────
P("8 · Live output", "h1")
P("The p5.js canvas", "h2")
P("Press <b>RUN CODE</b> (P) on a p5 template and the sketch opens in a floating panel. "
  "It reads the variables live, so turning a knob changes the artwork while it runs. The "
  "panel can be dragged by its title bar and resized, and it has its own effects strip for "
  "hue, saturation, brightness, blur and contrast.")
st.extend(shot("14-p5-canvas", "The p5.js canvas panel, running a sketch that reads the variables live."))
st.append(PageBreak())

P("The Display window", "h2")
P("<i>display.html</i> is a clean output window intended for a projector or an OBS browser "
  "source. It mirrors the canvas and the prompt text with none of the app's controls, and "
  "runs its own copy of the Glitcher effects so you can degrade the output without touching "
  "what you are working on.")
st.extend(shot("17-display-window", "The Display window before it receives anything — it waits for the main app to connect."))
P("Open it from the <b>Display</b> chip in the Connections strip. It talks to the main "
  "window over a broadcast channel, so both must be open in the same browser.", "note")
st.append(PageBreak())

# ── 9 ───────────────────────────────────────────────────────────────────────
P("9 · Connections", "h1")
P("The strip below the variables panel shows the four things the app can talk to. A chip "
  "is dimmed when that connection is inactive; <b>Hide inactive</b> collapses the ones you "
  "are not using.")
st.extend(table([
    ["Chip", "What it connects to"],
    ["MIDI", "A hardware controller. Map any knob, fader or pad to a variable, to template "
             "switching, or to a discrete action."],
    ["Scope", "Daydream Scope, a real-time diffusion renderer. Sends the prompt and the "
              "variable values as you move them. <b>Local install only.</b>"],
    ["Display", "Opens the Display window described above."],
    ["API", "Your Google AI Studio key. Green means the app can reach the model; on the "
            "hosted service this is handled for you."],
], [24 * mm, CONTENT_W - 24 * mm]))
st.append(PageBreak())

# ── 10 ──────────────────────────────────────────────────────────────────────
P("10 · Settings", "h1")
P("The gear icon in the top bar. The two settings that change what the app can do are the "
  "<b>API key</b> and the <b>backend tier</b>.")
st.extend(shot("13-settings", "Settings. Backend & Safety is where you switch between Google and a local model."))
P("<b>Backend tier</b> lets text generation run on your own hardware instead of Google's "
  "servers — point it at any OpenAI-compatible endpoint such as Ollama or LM Studio. "
  "Images, video and music always go through Google, so a key is still needed for those. "
  "Note that strict-JSON features like template generation are demanding, and smaller "
  "local models will sometimes fail them.")
st.append(PageBreak())

# ── 11 ──────────────────────────────────────────────────────────────────────
P("11 · Keyboard reference", "h1")
st.extend(table([
    ["Key", "Action"],
    ["Left / Right", "Step the selected variable through its values"],
    ["Up / Down", "Move between variables"],
    ["R", "Randomize every variable"],
    ["G", "Generate an image from the current prompt"],
    ["T", "Template Gen — write a new template with AI"],
    ["P", "Run the p5.js sketch"],
    ["C", "Copy the prompt to the clipboard"],
    ["F", "Like — save this combination"],
    ["Tab", "Move to the next control"],
    ["Esc", "Close the open dialog or panel"],
], [22 * mm, CONTENT_W - 22 * mm]))
P("Every dialog in the app takes focus when it opens, keeps it while open, closes on "
  "Escape and returns you to whatever you opened it from. The one deliberate exception is "
  "the terms screen at first sign-in, which ignores Escape because it is a consent step.", "note")
st.append(PageBreak())

# ── Appendix ────────────────────────────────────────────────────────────────
P("Appendix · Local install vs hosted", "h1")
st.extend(table([
    ["Feature", "Local install", "synthograsizer.com"],
    ["Text, images", "Your own API key, no limits", "300 free credits a month"],
    ["Video (Veo), Music (Lyria)", "Available", "Hidden — cost"],
    ["Workflows", "Needs the ChatRoom server", "Runs in the browser; video ones locked"],
    ["Scope integration", "Available", "Hidden — bridges to your own machine"],
    ["Videorama", "Available", "Local only by design"],
    ["Saving creations", "Saved to your disk", "Saved to your account"],
], [40 * mm, 45 * mm, CONTENT_W - 85 * mm]))
st.extend(shot("18-hub", "The suite hub — the other tools that ship alongside the main app."))

doc = SimpleDocTemplate(
    str(OUT), pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=22 * mm,
    title="Synthograsizer Suite — User Manual", author="Synthograsizer",
    subject="User manual", creator="Synthograsizer Suite",
)
doc.build(st, onFirstPage=footer, onLaterPages=footer)
print("wrote", OUT, f"({OUT.stat().st_size/1024:.0f} KB)")
