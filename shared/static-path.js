"use strict";
const path = require("path");

// A path is inside root only when relative() does not escape via '..'.
// String-prefix checks are unsafe because '/app-evil' starts with '/app'.
function isWithinRoot(root, target) {
  const base = path.resolve(root);
  const candidate = path.resolve(target);
  const relative = path.relative(base, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(".." + path.sep) &&
      !path.isAbsolute(relative))
  );
}

module.exports = { isWithinRoot };
