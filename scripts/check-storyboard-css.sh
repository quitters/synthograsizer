#!/bin/bash
# Verify every class selector in storyboard-panel-hardware-theme.css
# exists in either storyboard-panel.js or index.html.
# Catches selector/DOM drift before it ships.

CSS="static/synthograsizer/css/storyboard-panel-hardware-theme.css"
JS="static/synthograsizer/js/storyboard-panel.js"
HTML="static/synthograsizer/index.html"

if [ ! -f "$CSS" ]; then exit 0; fi

MISSING=0

while IFS= read -r cls; do
  # skip single-word names that aren't compound (filters out 'css', 'js' noise from comments)
  case "$cls" in
    *-*) ;;
    *) continue ;;
  esac

  if ! grep -q "$cls" "$JS" && ! grep -q "$cls" "$HTML"; then
    echo "MISSING: .$cls (in $CSS but not in $JS or $HTML)"
    MISSING=$((MISSING + 1))
  fi
done < <(grep -o '\.[a-z][a-z0-9-]*' "$CSS" | sed 's/^\.//' | sort -u)

if [ $MISSING -gt 0 ]; then
  echo ""
  echo "ERROR: $MISSING CSS class selectors have no matching DOM source."
  echo "Update the CSS selectors to match storyboard-panel.js output, or add"
  echo "the classes to the JS templates. See the CSS CONTRACT comment at the"
  echo "top of storyboard-panel.js for the full list."
  exit 1
fi

echo "OK: all storyboard CSS selectors matched."
exit 0
