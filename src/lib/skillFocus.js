// Which skill row should get focus after one is removed: next, else previous, else null.
export function focusAfterRemove(skills, label) {
  const index = skills.indexOf(label);
  if (index === -1) return null;
  return skills[index + 1] ?? skills[index - 1] ?? null;
}
