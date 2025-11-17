/**
 * Utility for fuzzy matching group names
 */

interface Group {
  id: string;
  name: string;
  icon?: string;
}

/**
 * Calculate similarity score between two strings (0-1)
 * Uses Levenshtein distance normalized
 */
function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) {
    return 1.0;
  }
  
  const editDistance = levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) {
      costs[s2.length] = lastValue;
    }
  }
  return costs[s2.length];
}

/**
 * Find the best matching group for a given name
 * Returns group ID if found, null otherwise
 */
export function findMatchingGroup(
  groupName: string | null | undefined,
  userGroups: Group[]
): string | null {
  if (!groupName || userGroups.length === 0) {
    return null;
  }

  const normalizedInput = groupName.toLowerCase().trim();
  
  // First, try exact match (case-insensitive)
  const exactMatch = userGroups.find(
    g => g.name.toLowerCase() === normalizedInput
  );
  if (exactMatch) {
    return exactMatch.id;
  }

  // Try partial match (input is contained in group name)
  const partialMatch = userGroups.find(
    g => g.name.toLowerCase().includes(normalizedInput) ||
         normalizedInput.includes(g.name.toLowerCase())
  );
  if (partialMatch) {
    return partialMatch.id;
  }

  // Try fuzzy matching with similarity threshold
  const SIMILARITY_THRESHOLD = 0.6; // 60% similarity required
  let bestMatch: Group | null = null;
  let bestScore = 0;

  for (const group of userGroups) {
    const score = similarity(normalizedInput, group.name.toLowerCase());
    if (score > bestScore && score >= SIMILARITY_THRESHOLD) {
      bestScore = score;
      bestMatch = group;
    }
  }

  return bestMatch?.id || null;
}

/**
 * Find matches for multiple group names
 */
export function findMatchingGroups(
  groupNames: (string | null | undefined)[],
  userGroups: Group[]
): (string | null)[] {
  return groupNames.map(name => findMatchingGroup(name, userGroups));
}

/**
 * Validate if a group ID exists in user's groups
 */
export function validateGroupId(
  groupId: string | null | undefined,
  userGroups: Group[]
): boolean {
  if (!groupId) return true; // null is valid (personal expense)
  return userGroups.some(g => g.id === groupId);
}

