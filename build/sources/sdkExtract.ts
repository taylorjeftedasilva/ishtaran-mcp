// Extracts real per-language SDK method signatures (name, params, HTTP verb + path shape)
// directly from each SDK's real public source code (sdks/{typescript,java,python,go}) --
// never invented by analogy from the operationId. Matches are joined to OpenAPI operations
// by comparing the HTTP verb + a normalized "path shape" (variable segments replaced with
// `*`), reconstructed from the real string literal fragments in each method body. Any
// operation this can't confidently match is left unmapped for that language rather than
// guessed -- surfaced as a build warning, never silently filled in.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { repoPath } from '../lib/paths.js';

export type SdkLanguage = 'typescript' | 'java' | 'python' | 'go';

export interface ExtractedSdkMethod {
  language: SdkLanguage;
  resourceFile: string;
  resourceAccessor: string; // e.g. "executionSources" (ts/py) or "ExecutionSources" (go) or "executionSources()" (java)
  methodName: string; // language-idiomatic method name as written in source
  httpVerb: string;
  pathShape: string; // e.g. "/v1/organizations/*/execution-sources/*/resource-stake"
  signature: string; // best-effort full call signature for display, from the doc comment/decl line
}

function normalizePathShape(rawPath: string): string {
  return rawPath
    .replace(/\{[^}]+\}/g, '*') // OpenAPI style {param}
    .split('?')[0]! // drop any query string a list() method concatenated in
    .replace(/\*+/g, '*')
    .replace(/([^/])\*$/, '$1') // a trailing `*` not preceded by `/` is a query-string
    // variable folded into the same template literal (e.g. `...${suffix}`), never a real
    // path segment -- OpenAPI paths never carry one.
    .replace(/\/+$/, '');
}

const PLACEHOLDER = ' ';

/** Extracts the first top-level argument of a call, starting right after its opening `(`, by
 * tracking paren depth -- so a nested call like `query.toString()` is captured whole
 * (`query.toString()`) instead of truncating at its own inner closing paren, which a plain
 * `[^,)]+` regex would do. Stops at the first top-level `,` or the matching outer `)`. */
function firstArgAfterOpenParen(source: string, openParenIndex: number): string {
  let depth = 0;
  let i = openParenIndex;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) break;
    } else if (ch === ',' && depth === 1) {
      break;
    }
  }
  return source.slice(openParenIndex + 1, i).trim();
}

/** Reduces a JS/TS template-literal, Python f-string, or Java/Go/older-JS string-concat path
 * expression to its static shape, replacing every interpolated/concatenated variable with a
 * single placeholder -- preserving position (including a variable at the very end of the
 * path), unlike a naive split+filter that would silently drop a trailing empty fragment.
 * `bodyBeforeCall` is searched for a local path-building assignment when the call site passes
 * a bare variable instead of an inline literal (e.g. a path built a few lines above the
 * actual HTTP call, or built up via a Java `StringBuilder`) -- resolved, never left opaque. */
function pathShapeFromCallExpression(argExpr: string, bodyBeforeCall = ''): string {
  let expr = argExpr.trim();

  // Strip a trailing `.toString()` before checking for a bare identifier -- Java's
  // `StringBuilder`-built paths are passed as `query.toString()`, not a bare name.
  const bareIdentifier = expr.match(/^([a-zA-Z_$][\w$]*)(?:\.\w+\(\))?$/)?.[1];
  if (bareIdentifier) {
    // `const/let/var name = <expr>` (JS/TS), `name := <expr>` (Go), or a Java
    // `var name = new StringBuilder(<expr>)` / `StringBuilder name = new StringBuilder(<expr>)`
    // constructor call -- whichever this language/method actually used. A ternary-assigned
    // path (`const path = cond ? \`/a?x=${y}\` : '/a'`) is left as-is -- the backtick/quote
    // scan below finds the first full literal regardless of surrounding ternary syntax, which
    // is always the real path's static prefix in these SDKs (a naive split on the ternary's
    // own `?` would collide with a `?` inside a query string and was tried and rejected here).
    // The final alternative (bare `name = <expr>`, no keyword) covers Python, which has no
    // const/let/var/:= -- kept last so it only applies once the more specific, keyword-based
    // JS/TS/Go/Java patterns above it have already had first refusal.
    const assignRe = new RegExp(
      `(?:(?:const|let|var)\\s+${bareIdentifier}\\s*=\\s*new\\s+StringBuilder|(?:const|let|var)\\s+${bareIdentifier}\\s*=|${bareIdentifier}\\s*:=|^\\s*${bareIdentifier}\\s*=(?!=))\\s*\\(?\\s*([^;\\n]+)`,
      'm',
    );
    // Strip a trailing `)` left over when the match was the StringBuilder constructor branch
    // (its own closing paren falls inside the `[^;\n]+` capture, since a stray `)` can't
    // legitimately end any of these path expressions otherwise).
    const assigned = bodyBeforeCall.match(assignRe)?.[1]?.replace(/\)+\s*$/, '');
    if (assigned) expr = assigned.trim();
  }

  if (expr.includes('`')) {
    // Template literal: `/v1/.../${id}/...`
    const inner = expr.match(/`([^`]*)`/)?.[1] ?? '';
    expr = inner.replace(/\$\{[^}]*\}/g, PLACEHOLDER);
  } else if (/^f["']/.test(expr)) {
    // Python f-string: f"/v1/.../{id}/..."
    const inner = expr.match(/f["']([^"']*)["']/)?.[1] ?? '';
    expr = inner.replace(/\{[^}]*\}/g, PLACEHOLDER);
  } else {
    // Concatenation: "literal" + var + "literal" (Java/Go/older JS) -- walk `+`-separated
    // tokens in order; a quoted token contributes its literal text, anything else (an
    // identifier, a function call) contributes one placeholder.
    const tokens = expr.split('+').map((t) => t.trim());
    const parts: string[] = [];
    for (const t of tokens) {
      const literal = t.match(/^["']([^"']*)["']$/);
      parts.push(literal ? (literal[1] ?? '') : PLACEHOLDER);
    }
    expr = parts.join('');
  }

  const shaped = expr.replace(new RegExp(PLACEHOLDER, 'g'), '*');
  return normalizePathShape(shaped.startsWith('/') ? shaped : `/${shaped}`);
}

interface LanguageConfig {
  language: SdkLanguage;
  resourceGlob: { dir: string; suffix: string };
  // Matches a method declaration start, capturing the method name.
  methodDeclRe: RegExp;
  // Matches an HTTP helper call within a method body, capturing the verb; the argument
  // itself is extracted separately via firstArgAfterOpenParen (paren-balanced).
  httpCallRe: RegExp;
  accessorFromFile: (fileBase: string) => string;
  // The character that closes a signature after the parameter list (return-type annotation
  // included) -- `{` for a real method body (TS/Java), `:` for Python's `def ...():`. Python has
  // no body-opening brace, so reusing `{` there would run past the signature into the first `{`
  // it finds inside the body itself (e.g. a dict literal argument a few lines down).
  signatureTerminator: '{' | ':';
}

const LANGUAGES: LanguageConfig[] = [
  {
    language: 'typescript',
    resourceGlob: { dir: repoPath('sdks', 'typescript', 'src', 'resources'), suffix: '.ts' },
    methodDeclRe: /^\s{2}(?:async\s+)?([a-zA-Z][a-zA-Z0-9]*)\(/gm,
    httpCallRe: /(get|post|patch|delete)Request\(/,
    accessorFromFile: (base) => base.replace(/Resource$/, '').replace(/^./, (c) => c.toLowerCase()),
    signatureTerminator: '{',
  },
  {
    language: 'python',
    resourceGlob: { dir: repoPath('sdks', 'python', 'src', 'ishtaran', 'resources'), suffix: '.py' },
    methodDeclRe: /^\s{4}def\s+([a-zA-Z_][a-zA-Z0-9_]*)\(/gm,
    httpCallRe: /(get|post|patch|delete)_request\(/,
    accessorFromFile: (base) => base.replace(/_resource$/, ''),
    signatureTerminator: ':',
  },
  {
    language: 'java',
    resourceGlob: { dir: repoPath('sdks', 'java', 'src', 'main', 'java', 'com', 'ishtaran', 'sdk', 'resources'), suffix: '.java' },
    methodDeclRe: /^\s{4}public\s+[\w<>.\[\],? ]+\s+([a-zA-Z][a-zA-Z0-9]*)\(/gm,
    httpCallRe: /HttpRequest\.(get|post|patch|delete)\(/,
    accessorFromFile: (base) => `${base.replace(/Resource$/, '').replace(/^./, (c) => c.toLowerCase())}()`,
    signatureTerminator: '{',
  },
  {
    language: 'go',
    resourceGlob: { dir: repoPath('sdks', 'go'), suffix: '.go' },
    methodDeclRe: /^func \(r \*(\w+)Resource\) ([A-Z][a-zA-Z0-9]*)\(/gm,
    httpCallRe: /(get|post|patch|delete)Request\(/,
    accessorFromFile: () => '', // Go accessor derived per-match from the receiver type, not filename.
    signatureTerminator: '{',
  },
];

/** Captures a full, real method signature for display -- from the declaration through the
 * matching close-paren of its parameter list (tracking paren depth, so nested generics/types
 * like `Promise<Foo<Bar>>` or a default-value call don't truncate it early), plus a same-line
 * return-type annotation if the body brace follows shortly after. A naive "first line only"
 * capture silently truncates any multi-line parameter list (e.g. `createPaymentIntent(\n  a,\n
 * b,\n)`) to just the method name and an unclosed `(` -- confirmed as a real defect via the
 * 2026-09-09 blind-LLM-test session, which is why this exists instead of `body.split('\n')[0]`. */
function captureFullSignature(body: string, openParenIndex: number, terminator: '{' | ':' = '{'): string {
  let depth = 0;
  let i = openParenIndex;
  for (; i < body.length; i++) {
    if (body[i] === '(') depth++;
    else if (body[i] === ')') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  const terminatorIndex = body.indexOf(terminator, i);
  const end = terminatorIndex !== -1 && terminatorIndex - i < 120 ? terminatorIndex + (terminator === ':' ? 1 : 0) : i;
  return body
    .slice(0, end)
    .replace(/\s+/g, ' ')
    .trim();
}

function extractArgFor(body: string, callRe: RegExp): { verb: string; argExpr: string } | null {
  const callMatch = body.match(callRe);
  if (!callMatch || callMatch.index === undefined) return null;
  const verb = callMatch[1] ?? '';
  const openParenIndex = callMatch.index + callMatch[0].length - 1;
  return { verb, argExpr: firstArgAfterOpenParen(body, openParenIndex) };
}

export function extractSdkMethods(): ExtractedSdkMethod[] {
  const results: ExtractedSdkMethod[] = [];

  for (const cfg of LANGUAGES) {
    let files: string[];
    try {
      files = readdirSync(cfg.resourceGlob.dir).filter(
        (f) => f.endsWith(cfg.resourceGlob.suffix) && !f.includes('test') && !f.includes('Test'),
      );
    } catch {
      continue;
    }

    for (const file of files) {
      const absFile = path.join(cfg.resourceGlob.dir, file);
      const content = readFileSync(absFile, 'utf-8');
      const base = file.replace(cfg.resourceGlob.suffix, '');

      if (cfg.language === 'go') {
        // Go: iterate every method on every *Resource receiver in the (flat) sdks/go dir.
        const re = /func \(r \*(\w+)Resource\) ([A-Z][a-zA-Z0-9]*)\(([^)]*)\)[^{]*\{/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          const [, receiver, methodName] = m;
          const bodyStart = m.index + m[0].length;
          const body = content.slice(bodyStart, bodyStart + 1200);
          const call = extractArgFor(body, cfg.httpCallRe);
          if (!call) continue;
          const goOpenParenIndex = m[0].indexOf('(', m[0].indexOf(methodName ?? ''));
          results.push({
            language: 'go',
            resourceFile: `sdks/go/${file}`,
            resourceAccessor: `${receiver}Resource`,
            methodName: methodName ?? '',
            httpVerb: call.verb.toUpperCase(),
            pathShape: pathShapeFromCallExpression(call.argExpr, body),
            signature: goOpenParenIndex === -1 ? m[0].replace(/\{$/, '').trim() : captureFullSignature(m[0], goOpenParenIndex),
          });
        }
        continue;
      }

      const accessor = cfg.accessorFromFile(base);
      // Walk method declarations; for each, look at the source up to the next declaration
      // (or 1600 chars, whichever is shorter) for the HTTP helper call.
      const declMatches = [...content.matchAll(cfg.methodDeclRe)];
      for (let i = 0; i < declMatches.length; i++) {
        const decl = declMatches[i];
        if (!decl) continue;
        const methodName = decl[1] ?? '';
        if (['constructor', '__init__', 'toJson', '_to_json'].includes(methodName)) continue;
        const start = decl.index ?? 0;
        const end = declMatches[i + 1]?.index ?? Math.min(content.length, start + 1600);
        const body = content.slice(start, end);
        const call = extractArgFor(body, cfg.httpCallRe);
        if (!call) continue;
        results.push({
          language: cfg.language,
          resourceFile: `sdks/${cfg.language}/.../${file}`,
          resourceAccessor: accessor,
          methodName,
          httpVerb: call.verb.toUpperCase(),
          pathShape: pathShapeFromCallExpression(call.argExpr, body),
          signature: captureFullSignature(body, decl[0].length - 1, cfg.signatureTerminator),
        });
      }
    }
  }

  return results;
}

/** Index extracted methods by `${httpVerb} ${pathShape}` for O(1) lookup against OpenAPI operations. */
export function indexByPathShape(methods: ExtractedSdkMethod[]): Map<string, ExtractedSdkMethod[]> {
  const index = new Map<string, ExtractedSdkMethod[]>();
  for (const m of methods) {
    const key = `${m.httpVerb} ${m.pathShape}`;
    const list = index.get(key) ?? [];
    list.push(m);
    index.set(key, list);
  }
  return index;
}
