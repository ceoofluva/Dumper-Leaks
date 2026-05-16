// beautifier.js
// A nicer wrapper around lua-format (luamin) for beautifying & minifying Lua code
// Made with love for you <3

const fs = require('fs');
const path = require('path');
const luamin = require('lua-format');

const HELP = `
Usage:
  node beautifier.js <input.lua> [output.lua] [--minify] [--preset <name>]

Examples:
  node beautifier.js script.lua               → beautified to script_beautified.lua
  node beautifier.js script.lua out.lua       → beautified to out.lua
  node beautifier.js dirty.lua --minify       → minified to dirty_min.lua
  node beautifier.js code.lua --preset compact

Presets:
  default     → readable, tabs, most renames on
  compact     → smaller but still readable
  aggressive  → very small, renames globals too
  readable    → maximum readability, no renames
`;

const presets = {
  default: {
    RenameVariables: true,
    RenameGlobals: false,
    SolveMath: true,
    Indentation: '  ',          // 2 spaces
    Comments: true,
    Semicolons: false,
    Newlines: true,
    SortKeys: false,
    WrapLength: 120
  },

  compact: {
    RenameVariables: true,
    RenameGlobals: false,
    SolveMath: true,
    Indentation: '',
    Comments: false,
    Semicolons: true,
    Newlines: false,
    SortKeys: true,
    WrapLength: 80
  },

  aggressive: {
    RenameVariables: true,
    RenameGlobals: true,
    SolveMath: true,
    Indentation: '',
    Comments: false,
    Semicolons: true,
    Newlines: false,
    SortKeys: true,
    WrapLength: 60
  },

  readable: {
    RenameVariables: false,
    RenameGlobals: false,
    SolveMath: false,
    Indentation: '\t',
    Comments: true,
    Semicolons: false,
    Newlines: true,
    SortKeys: false,
    WrapLength: 180
  }
};

function beautifyOrMinify(code, options, isMinify = false) {
  try {
    if (isMinify) {
      return luamin.Minify(code, options);
    } else {
      return luamin.Beautify(code, options);
    }
  } catch (err) {
    console.error("└─ Error while processing Lua code:");
    console.error(err.message);
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  let inputPath = null;
  let outputPath = null;
  let isMinify = false;
  let presetName = 'default';

  // parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--minify') {
      isMinify = true;
    }
    else if (arg === '--preset' && i + 1 < args.length) {
      presetName = args[++i];
      if (!presets[presetName]) {
        console.error(`Unknown preset: ${presetName}`);
        console.log('Available presets:', Object.keys(presets).join(', '));
        process.exit(1);
      }
    }
    else if (!inputPath) {
      inputPath = arg;
    }
    else if (!outputPath) {
      outputPath = arg;
    }
  }

  if (!inputPath) {
    console.error("No input file specified.");
    console.log(HELP);
    process.exit(1);
  }

  // read input
  let code;
  try {
    code = fs.readFileSync(inputPath, 'utf-8');
  } catch (e) {
    console.error(`Cannot read file: ${inputPath}`);
    console.error(e.message);
    process.exit(1);
  }

  // choose settings
  const settings = { ...presets[presetName] };

  console.log(`→ Using preset: ${presetName}`);
  console.log(`→ Mode: ${isMinify ? 'minify' : 'beautify'}`);
  console.log(`→ Renaming variables: ${settings.RenameVariables}`);
  console.log(`→ Renaming globals:   ${settings.RenameGlobals}`);
  console.log(`→ Solving math:       ${settings.SolveMath}`);

  // process
  const result = beautifyOrMinify(code, settings, isMinify);

  // decide output path
  if (!outputPath) {
    const dir = path.dirname(inputPath);
    const base = path.basename(inputPath, path.extname(inputPath));
    const ext = path.extname(inputPath) || '.lua';
    const suffix = isMinify ? '_min' : '_beautified';
    outputPath = path.join(dir, `${base}${suffix}${ext}`);
  }

  // write result
  try {
    fs.writeFileSync(outputPath, result, 'utf-8');
    console.log(`\nDone! Output saved to:`);
    console.log(`  → ${outputPath}`);
    console.log(`  → ${result.length.toLocaleString()} characters`);
  } catch (e) {
    console.error(`Failed to write output file: ${outputPath}`);
    console.error(e.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} else {
  // if someone requires this module
  module.exports = {
    beautify: (code, preset = 'default') => beautifyOrMinify(code, presets[preset], false),
    minify: (code, preset = 'default') => beautifyOrMinify(code, presets[preset], true),
    presets
  };
}