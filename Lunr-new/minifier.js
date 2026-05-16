#!/usr/bin/env node
'use strict';

// Roblox/Luau-safe minifier — does NOT use luamin.
// luamin is a Lua 5.1 tool that produces output that breaks Roblox executors.

const fs   = require('fs');
const path = require('path');

// ── CLI ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (!args[0] || args[0] === '--help') {
    console.error('Usage: node minifier.js <input.lua> [--renameVariables true|false] [--renameGlobals true|false] [--solveMath true|false]');
    process.exit(1);
}
const inputPath = args[0];

function flag(name, def) {
    const i = args.indexOf('--' + name);
    if (i === -1) return def;
    const v = (args[i + 1] || '').toLowerCase();
    return v === 'true' || v === '1' || v === 'on';
}

const OPT_RENAME_VARS = flag('renameVariables', false);
const OPT_SOLVE_MATH  = flag('solveMath',        false);
// renameGlobals accepted but intentionally not implemented — renames globals
// like `game`, `workspace`, `Enum` etc. which breaks every Roblox script.

if (!fs.existsSync(inputPath)) {
    console.error('Error: file not found: ' + inputPath);
    process.exit(1);
}

const src = fs.readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, '');

// ─────────────────────────────────────────────────────────────────────────────
//  TOKENIZER
// ─────────────────────────────────────────────────────────────────────────────
const T = {
    COMMENT: 'comment',
    STRING:  'string',
    NUMBER:  'number',
    NAME:    'name',
    OP:      'op',
    SPACE:   'space',
    NEWLINE: 'newline',
};

function tokenize(code) {
    const tokens = [];
    let i = 0;
    const len = code.length;

    while (i < len) {
        // long block comment  --[=*[ ... ]=*]
        if (code[i] === '-' && code[i+1] === '-' && code[i+2] === '[') {
            let eq = 0, j = i + 3;
            while (j < len && code[j] === '=') { eq++; j++; }
            if (code[j] === '[') {
                const close = ']' + '='.repeat(eq) + ']';
                const end = code.indexOf(close, j + 1);
                const raw = end === -1 ? code.slice(i) : code.slice(i, end + close.length);
                tokens.push({ kind: T.COMMENT, val: raw });
                i += raw.length; continue;
            }
        }
        // line comment
        if (code[i] === '-' && code[i+1] === '-') {
            let j = i + 2;
            while (j < len && code[j] !== '\n') j++;
            tokens.push({ kind: T.COMMENT, val: code.slice(i, j) });
            i = j; continue;
        }
        // long string  [=*[ ... ]=*]
        if (code[i] === '[' && (code[i+1] === '[' || code[i+1] === '=')) {
            let eq = 0, j = i + 1;
            while (j < len && code[j] === '=') { eq++; j++; }
            if (code[j] === '[') {
                const close = ']' + '='.repeat(eq) + ']';
                const end = code.indexOf(close, j + 1);
                const raw = end === -1 ? code.slice(i) : code.slice(i, end + close.length);
                tokens.push({ kind: T.STRING, val: raw });
                i += raw.length; continue;
            }
        }
        // double-quoted string
        if (code[i] === '"') {
            let j = i + 1;
            while (j < len && code[j] !== '"') { if (code[j] === '\\') j++; j++; }
            tokens.push({ kind: T.STRING, val: code.slice(i, j + 1) });
            i = j + 1; continue;
        }
        // single-quoted string
        if (code[i] === "'") {
            let j = i + 1;
            while (j < len && code[j] !== "'") { if (code[j] === '\\') j++; j++; }
            tokens.push({ kind: T.STRING, val: code.slice(i, j + 1) });
            i = j + 1; continue;
        }
        // backtick string (Luau interpolation) — kept as-is here, expanded later
        if (code[i] === '`') {
            let j = i + 1;
            while (j < len && code[j] !== '`') { if (code[j] === '\\') j++; j++; }
            tokens.push({ kind: T.STRING, val: code.slice(i, j + 1), isBacktick: true });
            i = j + 1; continue;
        }
        // newline
        if (code[i] === '\r') {
            if (code[i+1] === '\n') i++;
            tokens.push({ kind: T.NEWLINE, val: '\n' });
            i++; continue;
        }
        if (code[i] === '\n') {
            tokens.push({ kind: T.NEWLINE, val: '\n' });
            i++; continue;
        }
        // spaces/tabs
        if (code[i] === ' ' || code[i] === '\t') {
            let j = i + 1;
            while (j < len && (code[j] === ' ' || code[j] === '\t')) j++;
            tokens.push({ kind: T.SPACE, val: code.slice(i, j) });
            i = j; continue;
        }
        // number (including hex)
        if (/[0-9]/.test(code[i]) || (code[i] === '.' && /[0-9]/.test(code[i+1] || ''))) {
            let j = i;
            if (code[i] === '0' && /[xX]/.test(code[i+1] || '')) {
                j += 2;
                while (j < len && /[0-9a-fA-F_]/.test(code[j])) j++;
            } else {
                while (j < len && /[0-9_]/.test(code[j])) j++;
                if (j < len && code[j] === '.') {
                    j++;
                    while (j < len && /[0-9_]/.test(code[j])) j++;
                }
                if (j < len && /[eE]/.test(code[j])) {
                    j++;
                    if (j < len && /[+\-]/.test(code[j])) j++;
                    while (j < len && /[0-9]/.test(code[j])) j++;
                }
            }
            tokens.push({ kind: T.NUMBER, val: code.slice(i, j) });
            i = j; continue;
        }
        // identifier / keyword
        if (/[A-Za-z_]/.test(code[i])) {
            let j = i + 1;
            while (j < len && /[A-Za-z0-9_]/.test(code[j])) j++;
            tokens.push({ kind: T.NAME, val: code.slice(i, j) });
            i = j; continue;
        }
        // multi-char operators (longest first)
        const slice = code.slice(i, i + 3);
        const multiOps = ['//=','..=','...','..','==','~=','<=','>=','+=','-=','*=','/=','%=','^=','//','->','::'];
        let hit = false;
        for (const op of multiOps) {
            if (slice.startsWith(op)) {
                tokens.push({ kind: T.OP, val: op });
                i += op.length; hit = true; break;
            }
        }
        if (hit) continue;
        // single char
        tokens.push({ kind: T.OP, val: code[i] });
        i++;
    }
    return tokens;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Rebuild source from token list
// ─────────────────────────────────────────────────────────────────────────────
function toSource(tokens) {
    return tokens.map(t => t.val).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
//  TRANSFORM: Compound operators  (token-based)
//  x += expr  →  x = x + (expr)
// ─────────────────────────────────────────────────────────────────────────────
const COMPOUND_MAP = {
    '+=':'+', '-=':'-', '*=':'*', '/=':'/', '//=':'//', '%=':'%', '^=':'^', '..=':'..'
};

function expandCompoundOps(tokens) {
    // Work on source string (simpler and we retokenize anyway)
    let code = toSource(tokens);

    // Protect strings/comments before regex
    const saved = [];
    code = code.replace(/--\[(=*)\[([\s\S]*?)\]\1\]|--[^\n]*|\[(=*)\[([\s\S]*?)\]\3\]|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, m => {
        saved.push(m); return '\x00S' + (saved.length-1) + '\x00';
    });

    const ops = ['//=','..=','+=','-=','*=','/=','%=','^='];
    for (const op of ops) {
        const luaOp = COMPOUND_MAP[op];
        const esc = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // LHS: identifier chain (.field / [index])
        // RHS: non-greedy, stops before Lua block keywords, closing delimiters, EOL
        const re = new RegExp(
            '([A-Za-z_]\\w*(?:\\s*(?:\\.[A-Za-z_]\\w*|\\[[^\\]]+\\]))*)'
            + '\\s*' + esc + '\\s*'
            + '([^\\n;]+?)(?=\\s*\\b(?:end|then|do|until|else|and|or)\\b|\\s*[)\\]},]|\\s*$)',
            'gm'
        );
        code = code.replace(re, (_, lhs, rhs) =>
            lhs.trim() + ' = ' + lhs.trim() + ' ' + luaOp + ' (' + rhs.trim() + ')'
        );
    }

    code = code.replace(/\x00S(\d+)\x00/g, (_, i) => saved[parseInt(i)]);
    return tokenize(code);
}

// ─────────────────────────────────────────────────────────────────────────────
//  TRANSFORM: Backtick string interpolation
// ─────────────────────────────────────────────────────────────────────────────
function expandBackticks(tokens) {
    return tokens.map(tok => {
        if (tok.kind !== T.STRING || !tok.isBacktick) return tok;
        const inner = tok.val.slice(1, -1);
        const parts = [];
        const re = /\{([^}]+)\}/g;
        let last = 0, m;
        while ((m = re.exec(inner)) !== null) {
            if (m.index > last) parts.push(JSON.stringify(inner.slice(last, m.index)));
            parts.push('tostring(' + m[1] + ')');
            last = m.index + m[0].length;
        }
        if (last < inner.length) parts.push(JSON.stringify(inner.slice(last)));
        return { kind: T.STRING, val: parts.length === 0 ? '""' : '(' + parts.join('..') + ')' };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
//  TRANSFORM: Luau type annotations — strip safely
//  Only strips in param position (after ( or ,) and local var position.
//  NEVER touches method-call colons: game:GetService(...)
// ─────────────────────────────────────────────────────────────────────────────
function stripTypeAnnotations(tokens) {
    let code = toSource(tokens);
    const saved = [];
    code = code.replace(/--\[(=*)\[([\s\S]*?)\]\1\]|--[^\n]*|\[(=*)\[([\s\S]*?)\]\3\]|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*`/g, m => {
        saved.push(m); return '\x00S' + (saved.length-1) + '\x00';
    });

    // Return type:  ): Type  at end of line
    code = code.replace(/\)\s*:\s*[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\?)?(?:\s*<[^>]*>)?\s*(?=\n|\r|$)/gm, ')');

    // Param type using lookbehind: only after ( or , + identifier
    code = code.replace(
        /(?<=[(,]\s*[A-Za-z_]\w*)\s*\??\s*:\s*(?:\{[^}]*\}|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\?)?(?:\s*<[^>]*>)?)/g,
        ''
    );

    // Local var type: only when followed by =
    code = code.replace(
        /(?<=\blocal\s+[A-Za-z_]\w*)\s*\??\s*:\s*(?:\{[^}]*\}|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\?)?(?:\s*<[^>]*>)?)(?=\s*=)/g,
        ''
    );

    code = code.replace(/\x00S(\d+)\x00/g, (_, i) => saved[parseInt(i)]);
    return tokenize(code);
}

// ─────────────────────────────────────────────────────────────────────────────
//  TRANSFORM: Ternary `if` expression
// ─────────────────────────────────────────────────────────────────────────────
function expandTernary(tokens) {
    let code = toSource(tokens);
    const saved = [];
    code = code.replace(/--\[(=*)\[([\s\S]*?)\]\1\]|--[^\n]*|\[(=*)\[([\s\S]*?)\]\3\]|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, m => {
        saved.push(m); return '\x00S' + (saved.length-1) + '\x00';
    });

    if (/\bif\b/.test(code)) {
        code = code.replace(
            /([=(,\[]\s*)if\s+(.+?)\s+then\s+(.+?)\s+else\s+(.+?)(?=\s*[\n;,)\]]|\s*$)/g,
            (_, pre, cond, tv, ev) =>
                pre + '((' + cond.trim() + ') and (' + tv.trim() + ') or (' + ev.trim() + '))'
        );
    }

    code = code.replace(/\x00S(\d+)\x00/g, (_, i) => saved[parseInt(i)]);
    return tokenize(code);
}

// ─────────────────────────────────────────────────────────────────────────────
//  TRANSFORM: `continue` → goto + label
//
//  Key fix: a `for`/`while` line already contains its own `do` keyword,
//  so we must NOT count that `do` as an additional block open. The for/while
//  line is handled as one unit.
// ─────────────────────────────────────────────────────────────────────────────
function expandContinue(tokens) {
    const code = toSource(tokens);
    if (!/\bcontinue\b/.test(code)) return tokens;

    const lines      = code.split('\n');
    const result     = [];
    let   labelCount = 0;
    const loopLabels = [];   // label name for each open loop
    const blockStack = [];   // 'for'|'while'|'repeat'|'block'

    // Patterns for line classification
    const reFor    = /^\s*for\b/;
    const reWhile  = /^\s*while\b/;
    const reRepeat = /^\s*repeat\b/;
    const reEnd    = /^\s*end\b/;
    const reUntil  = /^\s*until\b/;
    const reCont   = /\bcontinue\b/g;

    // Count net non-loop block opens on a line (then/do minus end).
    // We EXCLUDE the trailing `do` on for/while lines since those are
    // handled as part of the loop opener, not a nested block.
    function netNonLoopOpens(line) {
        // For/while lines: their `do` is the loop's own opener — don't count it
        if (reFor.test(line) || reWhile.test(line)) return 0;
        const opens = (line.match(/\b(?:then|do|function)\b/g) || []).length;
        const ends  = (line.match(/\bend\b/g) || []).length;
        return opens - ends;
    }

    for (let line of lines) {
        // 1. Replace `continue` before touching the stack
        if (/\bcontinue\b/.test(line) && loopLabels.length > 0) {
            line = line.replace(reCont, 'goto ' + loopLabels[loopLabels.length - 1]);
        }

        // 2. Classify line and update block stack
        if (reFor.test(line) || reWhile.test(line)) {
            const lbl = '__c' + (labelCount++) + '__';
            loopLabels.push(lbl);
            blockStack.push('loop');
            result.push(line);
        } else if (reRepeat.test(line)) {
            const lbl = '__c' + (labelCount++) + '__';
            loopLabels.push(lbl);
            blockStack.push('repeat');
            result.push(line);
        } else if (reUntil.test(line)) {
            if (blockStack.length > 0 && blockStack[blockStack.length - 1] === 'repeat') {
                result.push('::' + loopLabels.pop() + '::');
                blockStack.pop();
            }
            result.push(line);
        } else if (reEnd.test(line)) {
            if (blockStack.length > 0 && blockStack[blockStack.length - 1] === 'loop') {
                result.push('::' + loopLabels.pop() + '::');
                blockStack.pop();
            } else if (blockStack.length > 0) {
                blockStack.pop();
            }
            result.push(line);
        } else {
            // Handle non-loop block openers/closers on this line
            const net = netNonLoopOpens(line);
            if (net > 0) {
                for (let k = 0; k < net; k++) blockStack.push('block');
            } else if (net < 0) {
                for (let k = 0; k < -net; k++) {
                    if (!blockStack.length) break;
                    if (blockStack[blockStack.length - 1] === 'loop') {
                        result.push('::' + loopLabels.pop() + '::');
                    }
                    blockStack.pop();
                }
            }
            result.push(line);
        }
    }

    return tokenize(result.join('\n'));
}

// ─────────────────────────────────────────────────────────────────────────────
//  TRANSFORM: Strip comments
// ─────────────────────────────────────────────────────────────────────────────
function stripComments(tokens) {
    return tokens.filter(t => t.kind !== T.COMMENT);
}

// ─────────────────────────────────────────────────────────────────────────────
//  TRANSFORM: Constant math folding  (opt-in)
// ─────────────────────────────────────────────────────────────────────────────
function foldMath(tokens) {
    if (!OPT_SOLVE_MATH) return tokens;
    let changed = true;
    while (changed) {
        changed = false;
        const out = [];
        let i = 0;
        while (i < tokens.length) {
            if (tokens[i].kind === T.NUMBER) {
                let j = i + 1;
                while (j < tokens.length && tokens[j].kind === T.SPACE) j++;
                if (j < tokens.length && tokens[j].kind === T.OP &&
                    ['+','-','*','/','%','^'].includes(tokens[j].val)) {
                    const op = tokens[j].val;
                    let k = j + 1;
                    while (k < tokens.length && tokens[k].kind === T.SPACE) k++;
                    if (k < tokens.length && tokens[k].kind === T.NUMBER &&
                        !tokens[i].val.includes('x') && !tokens[k].val.includes('x')) {
                        const a = parseFloat(tokens[i].val);
                        const b = parseFloat(tokens[k].val);
                        let res;
                        if (op === '+') res = a + b;
                        else if (op === '-') res = a - b;
                        else if (op === '*') res = a * b;
                        else if (op === '/' && b !== 0) res = a / b;
                        else if (op === '%' && b !== 0) res = ((a % b) + b) % b;
                        else if (op === '^') res = Math.pow(a, b);
                        if (res !== undefined && Number.isFinite(res)) {
                            const s = String(res);
                            if (parseFloat(s) === res) {
                                out.push({ kind: T.NUMBER, val: s });
                                i = k + 1; changed = true; continue;
                            }
                        }
                    }
                }
            }
            out.push(tokens[i++]);
        }
        tokens = out;
    }
    return tokens;
}

// ─────────────────────────────────────────────────────────────────────────────
//  TRANSFORM: Local variable renaming  (opt-in)
//  Safe: only renames `local` declarations. Never renames globals,
//  `self`, Roblox builtins, or anything used in string context.
// ─────────────────────────────────────────────────────────────────────────────
const LUA_KEYWORDS = new Set([
    'and','break','do','else','elseif','end','false','for','function',
    'goto','if','in','local','nil','not','or','repeat','return','then',
    'true','until','while','continue','self'
]);

const ROBLOX_GLOBALS = new Set([
    'game','workspace','script','Enum','Instance','Vector3','Vector2',
    'CFrame','Color3','UDim','UDim2','TweenInfo','BrickColor','Region3',
    'Ray','Rect','NumberRange','NumberSequence','ColorSequence','Font',
    'PhysicalProperties','RaycastParams','OverlapParams','Random',
    'math','string','table','os','io','debug','utf8','bit','bit32',
    'buffer','coroutine','task','_VERSION','_ENV','_G',
    'print','warn','error','tostring','tonumber','type','typeof',
    'select','pairs','ipairs','next','rawget','rawset','rawequal','rawlen',
    'setmetatable','getmetatable','pcall','xpcall','load','loadstring',
    'require','collectgarbage','assert','unpack','pack','table',
    'getfenv','setfenv','getgenv','getrenv','hookfunction','newcclosure',
    'iscclosure','islclosure','checkcaller','identifyexecutor',
    'readfile','writefile','appendfile','listfiles','isfile','isfolder',
    'makefolder','delfolder','delfile','Drawing','request','getcustomasset',
    'cloneref','getthreadidentity','setthreadidentity','getinfo',
    'getupvalues','getconstants','setupvalue','getrawmetatable',
    'setreadonly','isreadonly','firesignal','getconnections',
    'getinstances','getnilinstances','getscripts','getrunningscripts',
]);

function makeNameGen() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let idx = 0;
    return () => {
        let n = idx++;
        let name = '';
        do {
            name = chars[n % chars.length] + name;
            n = Math.floor(n / chars.length) - 1;
        } while (n >= 0);
        while (LUA_KEYWORDS.has(name) || ROBLOX_GLOBALS.has(name) || name === '_') {
            n = idx++;
            name = '';
            do { name = chars[n % chars.length] + name; n = Math.floor(n / chars.length) - 1; } while (n >= 0);
        }
        return name;
    };
}

function renameLocals(tokens) {
    if (!OPT_RENAME_VARS) return tokens;

    const gen = makeNameGen();
    // scopeMap[depth] → Map(origName → shortName)
    const scopeMap = {};
    let depth = 0;

    function getShort(name) {
        for (let d = depth; d >= 1; d--) {
            if (scopeMap[d] && scopeMap[d].has(name)) return scopeMap[d].get(name);
        }
        return null;
    }

    function declareLocal(name) {
        if (!scopeMap[depth]) scopeMap[depth] = new Map();
        if (!scopeMap[depth].has(name)) scopeMap[depth].set(name, gen());
        return scopeMap[depth].get(name);
    }

    const out = [];
    let nextIsLocal = false;

    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];

        if (tok.kind === T.COMMENT || tok.kind === T.STRING || tok.kind === T.NUMBER) {
            out.push(tok); nextIsLocal = false; continue;
        }
        if (tok.kind === T.SPACE || tok.kind === T.NEWLINE) {
            out.push(tok); continue;
        }
        if (tok.kind === T.OP) {
            out.push(tok); nextIsLocal = false; continue;
        }

        // NAME token
        const v = tok.val;

        // Scope tracking
        if (v === 'do' || v === 'then' || v === 'function' || v === 'repeat') {
            depth++;
            if (!scopeMap[depth]) scopeMap[depth] = new Map();
        } else if (v === 'end') {
            delete scopeMap[depth];
            depth = Math.max(0, depth - 1);
        } else if (v === 'until') {
            delete scopeMap[depth];
            depth = Math.max(0, depth - 1);
        }

        if (v === 'local') {
            nextIsLocal = true;
            out.push(tok); continue;
        }

        if (nextIsLocal && !LUA_KEYWORDS.has(v) && !ROBLOX_GLOBALS.has(v)) {
            const short = declareLocal(v);
            out.push({ kind: T.NAME, val: short });
            // Keep nextIsLocal for multi-decl `local a, b`
            const nxt = (() => { let j = i+1; while(j<tokens.length&&tokens[j].kind===T.SPACE)j++; return tokens[j]; })();
            if (!nxt || !(nxt.kind === T.OP && nxt.val === ',')) nextIsLocal = false;
            continue;
        }

        nextIsLocal = false;

        // Replace usage
        if (!LUA_KEYWORDS.has(v) && !ROBLOX_GLOBALS.has(v)) {
            const short = getShort(v);
            if (short) { out.push({ kind: T.NAME, val: short }); continue; }
        }

        out.push(tok);
    }

    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
//  TRANSFORM: Whitespace minification + line joining
//
//  Key rules:
//  1. Two word-like tokens (NAME/NUMBER) always need a separator.
//  2. After block-opening keywords (then/do/else/repeat/function/...) that are
//     followed immediately by a statement, emit a space not nothing — because
//     dropping the newline without adding a space merges tokens.
//  3. `..` adjacent to a number needs a space on both sides.
// ─────────────────────────────────────────────────────────────────────────────

// Keywords that, when followed by a statement on the next line, need a space
const NEED_SPACE_AFTER = new Set(['then','else','do','repeat','function','in','return','not','and','or','local']);
// Keywords that, when preceded by a statement on the previous line, need a space
const NEED_SPACE_BEFORE = new Set(['end','until','then','else','elseif','do','and','or','not','in']);

function minifyAndJoin(tokens) {
    // Step 1: Strip comments, collapse whitespace runs to a single marker
    // We'll track what's logically before/after each position.

    // Build a filtered list: only meaningful tokens + single SPACE/NEWLINE markers
    const flat = [];
    let i = 0;
    while (i < tokens.length) {
        const t = tokens[i];
        if (t.kind === T.COMMENT) { i++; continue; }
        if (t.kind === T.SPACE) {
            // Collapse run of spaces to one
            while (i < tokens.length && tokens[i].kind === T.SPACE) i++;
            flat.push({ kind: T.SPACE, val: ' ' });
            continue;
        }
        if (t.kind === T.NEWLINE) {
            // Collapse run of newlines/spaces to one newline
            while (i < tokens.length && (tokens[i].kind === T.NEWLINE || tokens[i].kind === T.SPACE)) i++;
            flat.push({ kind: T.NEWLINE, val: '\n' });
            continue;
        }
        flat.push(t);
        i++;
    }

    // Step 2: Decide for each SPACE/NEWLINE whether to keep as space, semicolon, or drop
    const out = [];
    for (let i = 0; i < flat.length; i++) {
        const t = flat[i];

        if (t.kind !== T.SPACE && t.kind !== T.NEWLINE) {
            out.push(t); continue;
        }

        // Find previous and next non-whitespace tokens
        let pi = i - 1;
        while (pi >= 0 && (flat[pi].kind === T.SPACE || flat[pi].kind === T.NEWLINE)) pi--;
        let ni = i + 1;
        while (ni < flat.length && (flat[ni].kind === T.SPACE || flat[ni].kind === T.NEWLINE)) ni++;

        const prev = pi >= 0 ? flat[pi] : null;
        const next = ni < flat.length ? flat[ni] : null;

        if (!prev || !next) continue; // edge whitespace — drop

        const pv = prev.val, nv = next.val;
        const pk = prev.kind, nk = next.kind;
        const prevIsWord = pk === T.NAME || pk === T.NUMBER;
        const nextIsWord = nk === T.NAME || nk === T.NUMBER;

        // Case 1: two word-like tokens — must have separator
        if (prevIsWord && nextIsWord) {
            // If prev is a keyword that needs space after, or next needs space before,
            // use a space. Otherwise a semicolon also works but space is cleaner for
            // keyword adjacency (then NAME, end NAME, etc.)
            if (t.kind === T.NEWLINE) {
                out.push({ kind: T.OP, val: ' ' });
            } else {
                out.push({ kind: T.SPACE, val: ' ' });
            }
            continue;
        }

        // Case 2: newline between statements — use semicolon
        if (t.kind === T.NEWLINE) {
            // Don't emit ; before/after certain tokens where it's wrong
            if (next && nk === T.NAME && ['end','until','else','elseif'].includes(nv)) continue;
            if (prev && pk === T.NAME && ['do','then','else','repeat','function'].includes(pv)) continue;
            if (prev && pk === T.OP && ['{','(','[',','].includes(pv)) continue;
            if (next && nk === T.OP && ['}',')',']',','].includes(nv)) continue;
            // Labels ::name:: — don't put ; before ::
            if (next && nk === T.OP && nv === ':' ) continue;
            if (prev && pk === T.OP && pv === ':' && out.length >= 2) continue;
            out.push({ kind: T.OP, val: ';' });
            continue;
        }

        // Case 3: space — only keep if needed
        // `..` adjacent to number needs space
        if ((pv === '..' || pv === '.') && nk === T.NUMBER) {
            out.push({ kind: T.SPACE, val: ' ' }); continue;
        }
        if ((nv === '..' || nv === '.') && pk === T.NUMBER) {
            out.push({ kind: T.SPACE, val: ' ' }); continue;
        }

        // Otherwise drop the space
    }

    // Step 3: Deduplicate semicolons and clean up
    const final = [];
    for (let i = 0; i < out.length; i++) {
        const t = out[i];
        if (t.kind === T.OP && t.val === ';') {
            const prev = final.length > 0 ? final[final.length - 1] : null;
            // No double semicolons
            if (prev && prev.kind === T.OP && prev.val === ';') continue;
            // No ; at very start
            if (!prev) continue;
        }
        final.push(t);
    }
    // Remove trailing semicolon
    while (final.length > 0 && final[final.length-1].kind === T.OP && final[final.length-1].val === ';') {
        final.pop();
    }

    return final;
}

// ─────────────────────────────────────────────────────────────────────────────
//  PIPELINE
// ─────────────────────────────────────────────────────────────────────────────
let tokens = tokenize(src);

tokens = expandCompoundOps(tokens);
tokens = expandBackticks(tokens);
tokens = stripTypeAnnotations(tokens);
tokens = expandContinue(tokens);
tokens = expandTernary(tokens);
tokens = stripComments(tokens);
tokens = foldMath(tokens);
tokens = renameLocals(tokens);
tokens = minifyAndJoin(tokens);

const minified = tokens.map(t => t.val).join('');

// ── Write output ──────────────────────────────────────────────────────────────
const banner     = '-- this file is generated using lunr discord.gg/9yAtRgpsua\n';
const output     = banner + minified;
const ext        = path.extname(inputPath);
const base       = inputPath.slice(0, inputPath.length - ext.length);
const outputPath = base + '_minified' + ext;

fs.writeFileSync(outputPath, output, 'utf8');
process.stdout.write(output);