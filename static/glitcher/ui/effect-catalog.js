// Complete the curated library from the engine registry, keeping its presentation.
export function completeEffectCatalog(categories, availableEffects) {
  const known = new Set(categories.flatMap(category => category.effects.map(effect => effect.id)));
  for (const effect of availableEffects) {
    if (known.has(effect.id)) continue;
    const categoryId = effect.category.toLowerCase();
    let category = categories.find(item => item.id === categoryId);
    if (!category) {
      category = { id: categoryId, label: effect.category, color: '#859d74', icon: '◇', effects: [] };
      categories.push(category);
    }
    category.effects.push({ id: effect.id, name: effect.name, desc: `${effect.category} effect · adjustable controls` });
    known.add(effect.id);
  }
  return categories;
}
