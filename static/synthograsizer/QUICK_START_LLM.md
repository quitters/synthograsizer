# Quick Start: LLM Template Generator

## 🚀 Setup (60 seconds)

### Step 1: Copy System Prompt
Open `SYSTEM_PROMPT.txt` and copy the entire contents.

### Step 2: Configure Your LLM
Go to your preferred LLM interface:
- **ChatGPT**: Settings → Custom Instructions → "How would you like ChatGPT to respond?"
- **Claude**: Start new chat → Set as system/preamble
- **API**: Set as `system` role message

**Important**: Enable **JSON mode** if available.

### Step 3: Send a User Prompt
Example: `Create a template for generating sci-fi character descriptions`

### Step 4: Copy the JSON Output
The LLM will respond with raw JSON. Copy it.

### Step 5: Test in SynthograsizerSmall
1. Open SynthograsizerSmall in your browser
2. Click "Import Template"
3. Save the JSON as a `.json` file
4. Select and import it
5. Start cycling through values!

---

## 📋 System Prompt (Copy This)

```
You are a template generator for SynthograsizerSmall, a creative prompt manipulation tool. Your task is to create JSON templates that users can interact with by cycling through variable options to craft customized prompts.

OUTPUT FORMAT: Respond with valid JSON only. No explanations, no markdown, just raw JSON.

TEMPLATE STRUCTURE:
{
  "promptTemplate": "A sentence with {{variable1}} and {{variable2}} placeholders.",
  "variables": [
    {
      "name": "variable1",
      "feature_name": "variable1",
      "values": ["option1", "option2", "option3", ...]
    }
  ]
}

CRITICAL RULES:
1. Templates MUST have 2-4 variables (minimum 2, maximum 4)
2. Use {{variable_name}} format in promptTemplate
3. Placeholder names must EXACTLY match the variable's "name" and "feature_name"
4. Each variable must have 6-12 diverse value options
5. The promptTemplate should be a complete, readable sentence

EXAMPLE:
{
  "promptTemplate": "A {{style}} illustration of {{subject}} in {{lighting}}.",
  "variables": [
    {
      "name": "style",
      "feature_name": "style",
      "values": ["minimalist", "detailed", "watercolor", "digital art", "oil painting", "sketch"]
    },
    {
      "name": "subject",
      "feature_name": "subject",
      "values": ["mountain landscape", "futuristic city", "cozy cabin", "alien planet", "underwater scene", "desert canyon"]
    },
    {
      "name": "lighting",
      "feature_name": "lighting",
      "values": ["golden hour", "moody twilight", "harsh noon sun", "soft morning light", "dramatic sunset", "moonlight"]
    }
  ]
}

Output ONLY the JSON, nothing else.
```

---

## 💡 Quick User Prompts

Just copy one of these and send it to your LLM:

```
Create a template for fantasy character descriptions
```

```
Generate a template for AI image prompts about nature
```

```
Make a template for startup pitch ideas
```

```
Build a template for blog post titles about productivity
```

---

## ✅ Validation Checklist

After getting JSON from the LLM, verify:

- [ ] Has 2-4 variables (not more, not less)
- [ ] Each `{{placeholder}}` matches a variable name
- [ ] Each variable has 6+ values
- [ ] JSON is valid (no syntax errors)
- [ ] Sentence reads naturally

---

## 🔧 Troubleshooting

### LLM adds explanations
**Fix**: Emphasize "Output ONLY the JSON" in your prompt

### More than 4 variables
**Fix**: Add to user prompt: "Keep it to 3 variables maximum"

### Values too similar
**Fix**: Add to user prompt: "Make the values very diverse and contrasting"

### JSON syntax errors
**Fix**: Enable JSON mode in LLM settings, or use a JSON validator

### Template doesn't import
**Fix**: 
1. Copy JSON to jsonlint.com to validate
2. Check variable count (must be 2-4)
3. Verify placeholder names match exactly

---

## 🎯 Pro Tips

### Get Better Results
1. **Be specific**: "Create a template for horror movie plots" > "Make a template"
2. **Specify variables**: "Include variables for setting, creature, and twist"
3. **Control complexity**: "Keep it simple with 2 variables" or "Use all 4 variables"

### Iterate Quickly
1. Generate template with LLM
2. Import into SynthograsizerSmall
3. Test by cycling values
4. If needed, ask LLM to refine: "Make the values more creative"

### Save Good Templates
- Create a `my-templates/` folder
- Name files descriptively: `sci-fi-worldbuilding.json`
- Keep a list of successful user prompts

---

## 🌟 Advanced Usage

### Chain Templates
Generate multiple related templates:
1. "Create a character template"
2. "Now create a location template that would fit those characters"
3. "Create a plot template using those characters and locations"

### Domain-Specific
Add constraints to your user prompt:
```
Create a template for medical device names, 
using variables for: body part, technology type, and benefit.
Keep all values professional and realistic.
```

### Mood Control
Specify the vibe:
```
Create a dark, moody template for noir detective stories
```

```
Create an upbeat, whimsical template for children's book ideas
```

---

## 📚 Resources

- **Full Documentation**: See `LLM_TEMPLATE_GENERATOR_PROMPT.md`
- **Example Prompts**: See `USER_PROMPT_EXAMPLES.txt`
- **System Prompt**: See `SYSTEM_PROMPT.txt`
- **Sample Templates**: See `sample-templates/` folder

---

## 🤖 Automation Ideas

### Simple Web Interface
```html
<textarea id="userPrompt" placeholder="What template do you want?"></textarea>
<button onclick="generateTemplate()">Generate</button>
<pre id="output"></pre>

<script>
async function generateTemplate() {
  const prompt = document.getElementById('userPrompt').value;
  const response = await callLLMAPI(prompt); // Your API call
  document.getElementById('output').textContent = response;
}
</script>
```

### Batch Generation
Create 10 templates at once:
```
Generate 10 different creative writing templates, 
each as a separate JSON object in an array
```

### Template Library
Build a database of generated templates:
- Store in JSON file or database
- Add metadata (category, tags, rating)
- Enable search and filtering
- Let users contribute their favorites

---

**Ready to generate infinite templates!** 🎨✨

Start with: `Create a template for [YOUR IDEA HERE]`
