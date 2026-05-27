import fs from "node:fs";
import path from "node:path";

// ── .gitignore parser ──

export function parseGitignore(projectDir) {
  const gitignorePath = path.join(projectDir, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return [];
  const content = fs.readFileSync(gitignorePath, "utf-8");
  return content.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"));
}

// Convert a gitignore pattern to a function that tests relative paths
export function buildGitignoreMatcher(patterns) {
  // Compile patterns into match functions
  const matchers = [];
  for (const raw of patterns) {
    const negated = raw.startsWith("!");
    const pat = negated ? raw.slice(1) : raw;
    const dirOnly = pat.endsWith("/");

    // Build regex from the gitignore pattern
    let re = gitignorePatternToRegex(pat, dirOnly);
    if (re) matchers.push({ re, negated });
  }
  return (relativePath, isDir) => {
    let result = false;
    for (const { re, negated } of matchers) {
      if (re.test(relativePath)) {
        result = !negated;
      }
    }
    return result;
  };
}

function gitignorePatternToRegex(pattern, dirOnly) {
  // Simplified gitignore pattern matching
  // Handles: *, **, ?, character classes, negation, directory-only patterns
  let pat = pattern.replace(/\/$/, ""); // strip trailing slash for matching

  // Anchored: starts with / means from root, otherwise match anywhere
  const anchored = pat.startsWith("/");
  if (anchored) pat = pat.slice(1);

  // Contains mid-pattern /**/ or trailing /** glob
  let regex = "";
  const segments = pat.split("/");

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === "**") {
      // /**/ matches zero or more directories
      regex += "(?:.+/)?";
    } else {
      // Convert glob segment to regex
      regex += globToRegex(seg);
      if (i < segments.length - 1) {
        regex += "/";
      }
    }
  }

  if (!anchored && !pat.includes("/")) {
    // Pattern without / matches in any directory
    regex = "(?:.+/)?" + regex;
  } else if (!anchored) {
    // Pattern with / but not starting with / — anchored to start or after /
    regex = "(?:^|/)" + regex.slice(regex.startsWith("(?:") ? 0 : 0);
    // Actually, just allow matching from any directory level
    regex = "(?:.+/)?(?:" + globToRegex(segments[0]);
    for (let i = 1; i < segments.length; i++) {
      if (segments[i] === "**") {
        regex += "(?:.+/)?";
      } else {
        regex += "/" + globToRegex(segments[i]);
      }
    }
    regex += ")";
  }

  try {
    return new RegExp("(?:^|/)" + regex + (dirOnly ? "/.*" : "(?:$|/.*)"), "i");
  } catch {
    return null;
  }
}

function globToRegex(glob) {
  return glob.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
}
