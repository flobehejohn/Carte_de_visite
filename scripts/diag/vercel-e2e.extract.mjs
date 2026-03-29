import fs from 'node:fs';

const input = fs.readFileSync(0, 'utf8');

function collectBalancedObjectRanges(text) {
  const ranges = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (inString) {
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        continue;
      }
      continue;
    }

    // not in string
    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (ch === '}') {
      if (depth > 0) depth -= 1;
      if (depth === 0 && start >= 0) {
        ranges.push([start, i + 1]);
        start = -1;
      }
      continue;
    }
  }

  return ranges;
}

const ranges = collectBalancedObjectRanges(input);

// Try from last to first: pick the last VALID JSON object (not just last balanced braces)
for (let k = ranges.length - 1; k >= 0; k -= 1) {
  const [a, b] = ranges[k];
  const cand = input.slice(a, b);
  try {
    const obj = JSON.parse(cand);
    process.stdout.write(JSON.stringify(obj));
    process.exit(0);
  } catch {
    // keep searching
  }
}

process.exit(1);
