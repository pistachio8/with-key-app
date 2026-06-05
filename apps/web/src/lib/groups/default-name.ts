const DEFAULT_GROUP_SUFFIX = "님과 친구들";
const MAX_GROUP_NAME_LENGTH = 30;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function defaultGroupBaseName(displayName: string | null | undefined): string {
  const base = `${displayName?.trim() || "내"}${DEFAULT_GROUP_SUFFIX}`;
  return base.slice(0, MAX_GROUP_NAME_LENGTH);
}

export function isDefaultGroupName(name: string | null | undefined, baseName: string): boolean {
  if (!name) return false;
  const pattern = new RegExp(`^${escapeRegExp(baseName)}(?: #\\d+)?$`);
  return pattern.test(name);
}

export function nextDefaultGroupName(
  displayName: string | null | undefined,
  existingNames: ReadonlyArray<string | null | undefined>,
): string {
  const baseName = defaultGroupBaseName(displayName);
  const count = existingNames.filter((name) => isDefaultGroupName(name, baseName)).length;
  if (count === 0) return baseName;

  const suffix = ` #${count + 1}`;
  return `${baseName.slice(0, MAX_GROUP_NAME_LENGTH - suffix.length)}${suffix}`;
}
