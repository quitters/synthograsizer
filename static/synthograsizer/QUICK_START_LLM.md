# Quick Start: LLM Template Generator

Generate Synthograsizer templates with any LLM (ChatGPT, Claude, Gemini, local models) in about a minute.

> **Canonical system prompt:** [`SYSTEM_PROMPT.txt`](SYSTEM_PROMPT.txt) — always copy from there. It is kept in sync with the template schema ([`docs/SCHEMA.md`](../../docs/SCHEMA.md)). This guide intentionally does not duplicate the prompt text, so it can't drift out of date.

## 🚀 Setup (60 seconds)

### Step 1: Copy the System Prompt
Open `SYSTEM_PROMPT.txt` and copy the entire contents.

### Step 2: Configure Your LLM
- **ChatGPT**: Settings → Custom Instructions, or paste at the start of a new chat
- **Claude**: Paste as the first message / set as system prompt
- **API**: Set as the `system` role message

**Important**: Enable **JSON mode** if available.

### Step 3: Send a User Prompt
Example: `Create a template for generating sci-fi character descriptions`

See `USER_PROMPT_EXAMPLES.txt` for more ready-made prompts.

### Step 4: Import into Synthograsizer
1. Copy the JSON output
2. Open Synthograsizer in your browser
3. Click "Import Template" and paste (or save as a `.json` file and select it)
4. Start cycling through values!

---

## ✅ Validation Checklist

After getting JSON from the LLM, verify:

- [ ] JSON is valid (no syntax errors)
- [ ] Each `{{placeholder}}` in `promptTemplate` exactly matches a variable's `name`
- [ ] Each variable has a Title Case `feature_name` display label
- [ ] Every entry in `values` is an object: `{"text": "...", "weight": N}` — never a bare string
- [ ] Weights are integers 1–3 (3 = common, 2 = uncommon, 1 = rare)
- [ ] No separate parallel `weights` array on any variable
- [ ] The sentence reads naturally with any combination of values

---

## 🔧 Troubleshooting

| Problem | Fix |
|---------|-----|
| LLM adds explanations around the JSON | Re-emphasize "Output ONLY the JSON" |
| Values come back as bare strings | Remind it: every value is `{"text": ..., "weight": ...}` |
| Values too similar | Add: "Make the values very diverse and contrasting" |
| JSON syntax errors | Enable JSON mode, or validate at jsonlint.com |
| Template doesn't import | Check placeholder names match variable names exactly |

---

## 🎯 Pro Tips

### Get Better Results
1. **Be specific**: "Create a template for horror movie plots" > "Make a template"
2. **Specify variables**: "Include variables for setting, creature, and twist"
3. **Control complexity**: "Keep it simple with 2 variables" or "Use 6 variables"

### Iterate Quickly
1. Generate template with the LLM
2. Import into Synthograsizer and test by cycling values
3. If needed, ask the LLM to refine: "Make the values more creative"

### Mood Control
Specify the vibe in your user prompt:
```
Create a dark, moody template for noir detective stories
```
```
Create an upbeat, whimsical template for children's book ideas
```

---

## 📚 Resources

- **System Prompt (canonical)**: `SYSTEM_PROMPT.txt`
- **Full Documentation**: `LLM_TEMPLATE_GENERATOR_PROMPT.md`
- **Example Prompts**: `USER_PROMPT_EXAMPLES.txt`
- **Template Schema**: `docs/SCHEMA.md` (repo root)

> Note: the in-app template builder (Studio → Generate Template) calls the backend's Gemini pipeline directly and doesn't need any of this — this guide is for generating templates with an external LLM.

**Start with:** `Create a template for [YOUR IDEA HERE]`
