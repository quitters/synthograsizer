"""Build the hosted-service guide PDF (synthograsizer.com, free tier)."""
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Image,
                                PageBreak, Table, TableStyle)
from PIL import Image as PILImage

SHOTS = Path(__file__).parent / "shots_hosted"
OUT = Path(__file__).parent / "Synthograsizer-Hosted-Guide.pdf"

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

INK = colors.HexColor("#2b2b33")
TEAL = colors.HexColor("#00695c")
MUTED = colors.HexColor("#5a5a66")
RULE = colors.HexColor("#d8d4cc")

ss = getSampleStyleSheet()
S = {
    "title": ParagraphStyle("t", parent=ss["Title"], fontName="Helvetica-Bold",
                            fontSize=28, leading=33, textColor=INK, spaceAfter=6),
    "subtitle": ParagraphStyle("st", parent=ss["Normal"], fontName="Helvetica",
                               fontSize=12.5, leading=17, textColor=MUTED, spaceAfter=18),
    "h1": ParagraphStyle("h1", parent=ss["Heading1"], fontName="Helvetica-Bold",
                         fontSize=19, leading=23, textColor=TEAL, spaceBefore=4, spaceAfter=9),
    "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold",
                         fontSize=13, leading=17, textColor=INK, spaceBefore=13, spaceAfter=5),
    "body": ParagraphStyle("b", parent=ss["Normal"], fontName="Helvetica",
                           fontSize=10.2, leading=15.2, textColor=INK, spaceAfter=8, alignment=TA_LEFT),
    "caption": ParagraphStyle("c", parent=ss["Normal"], fontName="Helvetica-Oblique",
                              fontSize=8.8, leading=12, textColor=MUTED, spaceBefore=5, spaceAfter=14),
    "note": ParagraphStyle("n", parent=ss["Normal"], fontName="Helvetica",
                           fontSize=9.4, leading=13.5, textColor=INK, leftIndent=8, rightIndent=8,
                           spaceBefore=5, spaceAfter=11, borderPadding=7,
                           backColor=colors.HexColor("#f2efe8")),
    "cell": ParagraphStyle("cl", parent=ss["Normal"], fontName="Helvetica",
                           fontSize=9.3, leading=13, textColor=INK),
    "cellb": ParagraphStyle("cb", parent=ss["Normal"], fontName="Helvetica-Bold",
                            fontSize=9.3, leading=13, textColor=INK),
}


def shot(name, caption, frac=1.0):
    p = SHOTS / f"{name}.png"
    if not p.exists():
        return [Paragraph(f"[missing: {name}]", S["caption"])]
    iw, ih = PILImage.open(p).size
    w = CONTENT_W * frac
    h = w * ih / iw
    if h > 118 * mm:
        h = 118 * mm
        w = h * iw / ih
    im = Image(str(p), width=w, height=h)
    im.hAlign = "CENTER"
    return [im, Paragraph(caption, S["caption"])]


def table(rows, widths):
    data = [[Paragraph(c, S["cellb"] if i == 0 else S["cell"]) for c in r]
            for i, r in enumerate(rows)]
    t = Table(data, colWidths=widths, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ece8e0")),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, RULE),
        ("LINEBELOW", (0, 1), (-1, -2), 0.35, colors.HexColor("#eae7e0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return [t, Spacer(1, 12)]


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8); canvas.setFillColor(MUTED)
    if doc.page > 1:
        canvas.drawString(MARGIN, 11 * mm, "synthograsizer.com — Hosted Service Guide")
        canvas.drawRightString(PAGE_W - MARGIN, 11 * mm, str(doc.page))
        canvas.setStrokeColor(RULE); canvas.setLineWidth(0.4)
        canvas.line(MARGIN, 15 * mm, PAGE_W - MARGIN, 15 * mm)
    canvas.restoreState()


st = []
P = lambda t, s="body": st.append(Paragraph(t, S[s]))

# ── Cover ───────────────────────────────────────────────────────────────────
st.append(Spacer(1, 38 * mm))
P("synthograsizer.com", "title")
P("A guide to the hosted service — what's free, what things cost, and what "
  "the browser version can and cannot do.", "subtitle")
st.extend(shot("s1-signed-in-perform",
               "The hosted app, signed in. The credits balance sits in the top-right pill."))
P("Everything in this guide was checked against the live service on a normal free "
  "account — no admin privileges. Prices and limits are the ones the service actually "
  "quoted, not estimates.", "note")
st.append(PageBreak())

# ── 1 ───────────────────────────────────────────────────────────────────────
P("1 · What you get", "h1")
P("Synthograsizer is free to use in the browser. Sign in with a Google account and you "
  "get <b>300 credits a month</b>, which refill on the 1st. There is no card, no trial "
  "period, and no charge if you run out — generation simply stops until the balance resets.")
st.extend(table([
    ["", "Without an account", "Signed in, free tier"],
    ["Templates, knobs, prompts", "Yes — everything", "Yes"],
    ["p5.js sketches (Run Code)", "Yes", "Yes"],
    ["AI image generation", "No", "300 credits a month"],
    ["Saving work to your account", "No", "200 MB"],
    ["Workflows", "No", "14 of 17"],
], [46 * mm, 42 * mm, CONTENT_W - 88 * mm]))
P("The credits pay for AI calls only. Nothing else in the app is metered.")
st.append(PageBreak())

# ── 2 ───────────────────────────────────────────────────────────────────────
P("2 · Before you sign in", "h1")
P("You do not need an account to try it. Open the site and the whole instrument works: "
  "load a template, turn the knobs, watch the prompt rewrite itself, run a p5.js sketch. "
  "Only the AI calls are behind the sign-in.")
st.extend(shot("a2-app-signed-out", "The app with no account. Templates, knobs and the prompt all work."))
P("Press GENERATE without an account and the app tells you plainly what it needs, rather "
  "than failing silently.")
st.extend(shot("a3-anon-generate-wall",
               "The sign-in wall. The output panel says what happened, and a 'Jump to results' "
               "button appears so keyboard users can reach the message."))
st.append(PageBreak())

# ── 3 ───────────────────────────────────────────────────────────────────────
P("3 · Signing in", "h1")
P("Click <b>Sign in with Google</b> at the top right. The first time, you will be asked to "
  "accept the terms — this is a one-off, and it is recorded against your account.")
st.extend(shot("a4-sign-in-control", "The sign-in control in the app bar.", 0.85))
P("After signing in, the button is replaced by your account pill showing your name and "
  "your credit balance.")
st.append(PageBreak())

# ── 4 ───────────────────────────────────────────────────────────────────────
P("4 · What things cost", "h1")
P("Every priced action tells you the price <b>before</b> you run it. The figures below are "
  "the live rates quoted by the service.")
st.extend(table([
    ["Action", "Credits"],
    ["Text generation (Gemini 3.6 Flash)", "1"],
    ["Text generation (Gemini 3.1 Pro)", "5"],
    ["Image — Gemini 2.5 Flash", "4"],
    ["Image — Gemini 3.1 Flash", "5"],
    ["Image — Gemini 3 Pro", "15"],
    ["Analysing an image", "2 each"],
    ["Smart Transform", "image price + 2"],
    ["A workflow", "the sum of its steps"],
], [CONTENT_W - 32 * mm, 32 * mm]))
P("At 4–5 credits an image, 300 credits is roughly <b>60–75 images a month</b>, or several "
  "hundred text generations. A single generation in testing took the balance from 204 "
  "to 199.", "note")
st.extend(shot("s7-smart-transform",
               "Smart Transform quotes its price on the Run button and on every model option, "
               "so the expensive choice is never a surprise."))
st.append(PageBreak())

# ── 5 ───────────────────────────────────────────────────────────────────────
P("5 · The tools you have", "h1")
P("In <b>Studio</b> mode the top bar carries four menus. On the hosted service these hold "
  "the tools that run in your browser or through the metered API.")
st.extend(table([
    ["Menu", "On the hosted service"],
    ["GENERATE", "Image Studio, and Template Gen"],
    ["TRANSFORM", "Smart Transform · Glitcher Studio · Image Analysis"],
    ["AUTOMATE", "Workflows · Agent Studio · AI Chat"],
    ["INSPECT", "Metadata · Trace Viewer"],
], [30 * mm, CONTENT_W - 30 * mm]))
st.extend(shot("s3-generate-menu",
               "The GENERATE menu on hosted. Video Studio and Music Studio are not listed — "
               "see section 8."))
st.append(PageBreak())

# ── 6 ───────────────────────────────────────────────────────────────────────
P("6 · Generating an image", "h1")
P("Load a template, turn the knobs until the prompt reads how you want it, then press "
  "<b>GENERATE</b> (or G). For more control — model, aspect ratio, reference images — use "
  "<b>Image Studio</b> from the GENERATE menu.")
st.extend(shot("s6-image-studio", "Image Studio. Everything is set before you spend anything."))
st.append(PageBreak())
P("The result appears in the AI Studio Output panel, with a line saying what happened and "
  "your balance updated in the top bar.")
st.extend(shot("s12-generated-result",
               "A finished generation. Download saves the file to your device; Save keeps it "
               "in your account."))
st.extend(table([
    ["Button", "What it does"],
    ["Download", "Saves the PNG to your device. Nothing is uploaded. Works signed out too. "
                    "Note the file's metadata carries the prompt that made it."],
    ["Save", "Keeps the image in your account, under My creations."],
], [26 * mm, CONTENT_W - 26 * mm]))
st.append(PageBreak())

# ── 7 ───────────────────────────────────────────────────────────────────────
P("7 · Workflows", "h1")
P("A workflow is a chain of steps run for you — generate, analyse, rewrite, generate again. "
  "There are <b>17</b>, and on the hosted service they run <b>in your browser</b>, so there "
  "is nothing to install. Each step is charged at its normal rate.")
st.extend(shot("s8-workflows", "The workflow library. Each card says what the chain produces."))
P("<b>Three of the 17 are locked</b> — the ones that generate video. They stay visible so "
  "you can see what exists, and say why they are unavailable rather than failing when "
  "pressed.")
st.extend(shot("s9-locked-workflow",
               "A locked workflow: “Generates video — available on a local install, or to admins.”"))
st.append(PageBreak())

# ── 8 ───────────────────────────────────────────────────────────────────────
P("8 · What the hosted service does not have", "h1")
P("Four things are deliberately absent in the browser. None of them is broken — they are "
  "hidden rather than left to fail.")
st.extend(table([
    ["Feature", "Why not"],
    ["Video generation (Veo)", "A single clip can cost more than a month of everyone else's "
                               "text generation. Available on a local install."],
    ["Music generation (Lyria)", "Same reason."],
    ["Scope integration", "It bridges to a renderer running on your own machine, so a hosted "
                          "button could only ever fail."],
    ["Videorama", "Batch video synthesis — local only by design."],
], [40 * mm, CONTENT_W - 40 * mm]))
st.extend(shot("s10-connections",
               "The Connections strip on hosted: MIDI, Display and API. Scope is not shown."))
P("All four are available if you run Synthograsizer yourself — it is open source, and a "
  "local install has no credit limits because you supply your own API key.", "note")
st.append(PageBreak())

# ── 9 ───────────────────────────────────────────────────────────────────────
P("9 · My creations", "h1")
P("Anything you press <b>Save</b> on is kept in your account, with a <b>200 MB</b> "
  "allowance. Open it from your account pill, then <b>My creations</b>.")
st.extend(shot("s5-my-creations",
               "The gallery: a thumbnail, size and date per item, with View and Delete. The "
               "meter at the top shows how much of your 200 MB is used."))
P("Saving is always explicit. Nothing you generate is stored on the server unless you "
  "press Save — everything else lives only in your browser until you download it.", "note")
st.append(PageBreak())

# ── 10 ──────────────────────────────────────────────────────────────────────
P("10 · Your account and your data", "h1")
st.extend(shot("s4-account-menu", "The account menu.", 0.9))
st.extend(table([
    ["Item", "What it does"],
    ["My creations", "Your saved images, with the storage meter."],
    ["Download my data", "Exports everything held about your account as JSON."],
    ["Delete my account…", "Removes your account, sessions and saved creations. Immediate "
                           "and irreversible. Templates and outputs kept in your browser stay "
                           "on your device."],
    ["Sign out", "Ends the session on this device."],
], [36 * mm, CONTENT_W - 36 * mm]))
P("The menu also shows your tier and the date your credits reset.")
st.append(PageBreak())

# ── 11 ──────────────────────────────────────────────────────────────────────
P("11 · Good to know", "h1")
P("Prompt text is not stored", "h2")
P("The service records that a generation happened and how much it cost, but not what you "
  "typed. The exception is a template you explicitly save, because a template <i>is</i> "
  "prompt text — that one is spelled out in the terms.")
P("Downloaded images carry their prompt", "h2")
P("Generated PNGs embed the prompt that made them in their metadata. That is useful for "
  "reproducing your own work, but it means sharing the file shares the prompt.")
P("Where it runs", "h2")
P("The service runs in Montréal, Canada, and generation is performed by Google's models. "
  "Nothing is retained by Google between calls.")
P("If you run out", "h2")
P("Generation stops and the app says so. Your balance refills on the 1st. Nothing is lost "
  "and nothing is charged.")
st.append(PageBreak())

P("Appendix · Hosted vs running it yourself", "h1")
st.extend(table([
    ["", "synthograsizer.com", "Local install"],
    ["Cost", "Free, 300 credits a month", "Free — you supply an API key"],
    ["Limits", "300 credits", "None beyond your own API quota"],
    ["Setup", "None", "Python 3.10+, a few minutes"],
    ["Video and music", "Not available", "Available"],
    ["Scope, Videorama", "Not available", "Available"],
    ["Workflows", "14 of 17, in-browser", "All 17, needs the ChatRoom server"],
    ["Your saved work", "In your account, 200 MB", "On your own disk"],
], [34 * mm, 52 * mm, CONTENT_W - 86 * mm]))
st.extend(shot("a1-landing", "synthograsizer.com", 0.9))

doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
                        topMargin=MARGIN, bottomMargin=22 * mm,
                        title="synthograsizer.com — Hosted Service Guide",
                        author="Synthograsizer", subject="Hosted service guide")
doc.build(st, onFirstPage=footer, onLaterPages=footer)
print("wrote", OUT, f"({OUT.stat().st_size/1024:.0f} KB)")
