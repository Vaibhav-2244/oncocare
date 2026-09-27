import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

type LocaleMessages = Record<string, unknown>;
type TextCandidate = {
  node: ts.Node;
  value: string;
  kind: 'jsxText' | 'literal' | 'attribute' | 'template';
  placeholders?: Array<{ name: string; expression: ts.Expression }>;
  leadingSpace?: boolean;
  trailingSpace?: boolean;
};
type SourceEdit = { start: number; end: number; text: string };

const root = process.cwd();
const messagesPath = path.join(root, 'messages', 'en.json');
const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8')) as LocaleMessages;
const modifiedFiles: string[] = [];
const skippedCounts = new Map<string, number>();
const skippedSamples: string[] = [];
const ambiguousSamples: string[] = [];
let extractedOccurrences = 0;

function walkTsx(directory: string, base: 'app' | 'components'): string[] {
  const results: string[] = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      if (base === 'components' && relativePath === 'components/ui') continue;
      if (base === 'app' && (
        relativePath === 'app/api' ||
        relativePath.startsWith('app/api/') ||
        relativePath === 'app/dashboard/ai-engine' ||
        relativePath.startsWith('app/dashboard/ai-engine/') ||
        relativePath === 'app/dashboard/emergency' ||
        relativePath.startsWith('app/dashboard/emergency/')
      )) continue;
      results.push(...walkTsx(absolutePath, base));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      results.push(absolutePath);
    }
  }

  return results;
}

function toSegment(value: string): string {
  const unwrapped = value.replace(/^\[(\.\.\.)?(.+?)\]$/, '$2');
  const words = unwrapped.match(/[A-Za-z0-9]+/g) || [];
  return words.map((word, index) => {
    const lower = word.toLowerCase();
    return index === 0 ? lower : lower[0].toUpperCase() + lower.slice(1);
  }).join('');
}

function getNamespace(filePath: string): string {
  const relativePath = path.relative(root, filePath).replace(/\\/g, '/');
  const parts = relativePath.split('/');

  if (parts[0] === 'app') {
    const fileName = parts.pop() || '';
    let routeParts = parts.slice(1).filter((part) => !/^\(.*\)$/.test(part));
    if (routeParts[0] === 'dashboard') routeParts = routeParts.slice(1);
    const route = routeParts.map(toSegment).filter(Boolean);
    if (route.length === 0) route.push('home');
    if (!['page.tsx', 'layout.tsx', 'loading.tsx', 'error.tsx', 'not-found.tsx'].includes(fileName)) {
      route.push(toSegment(fileName.replace(/\.tsx$/, '')));
    }
    return route.join('.');
  }

  return parts.map((part, index) => (
    index === parts.length - 1 ? toSegment(part.replace(/\.tsx$/, '')) : toSegment(part)
  )).filter(Boolean).join('.');
}

function normalizeJsxText(raw: string): string {
  const lines = raw.split(/\r?\n/);
  let result = '';

  lines.forEach((line, index) => {
    let value = line.replace(/\t/g, ' ');
    if (index > 0) value = value.replace(/^ +/, '');
    if (index < lines.length - 1) value = value.replace(/ +$/, '');
    if (value) result += value + (index < lines.length - 1 ? ' ' : '');
  });

  return result;
}

function skipReason(value: string, hasIcuPlaceholders = false): string | null {
  const text = value.trim();
  if (!text) return 'whitespace-only';
  if (/^(?:https?:\/\/|mailto:|tel:|www\.)/i.test(text)) return 'URL or contact link';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return 'email address';
  if (!/\p{L}/u.test(text) && !hasIcuPlaceholders) return 'numeric or symbol-only text';
  if (/^[A-Z0-9]{1,3}$/.test(text)) return 'short uppercase token';
  if (text.length > 1000) return 'unusually long text';
  return null;
}

function reportSkip(reason: string, node: ts.Node, sourceFile: ts.SourceFile, value: string) {
  skippedCounts.set(reason, (skippedCounts.get(reason) || 0) + 1);
  if (reason === 'text outside a recognized function component' && ambiguousSamples.length < 40) {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    ambiguousSamples.push(`${path.relative(root, sourceFile.fileName).replace(/\\/g, '/')}:${line} [not transformed: no component scope] ${JSON.stringify(value.trim())}`);
  }
  if (skippedSamples.length < 20) {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    skippedSamples.push(`${path.relative(root, sourceFile.fileName).replace(/\\/g, '/')}:${line} [${reason}] ${JSON.stringify(value.trim())}`);
  }
}

function keyFromText(value: string): string {
  const words = value.match(/[\p{L}\p{N}]+/gu) || [];
  let key = words.map((word, index) => {
    const lower = word.toLowerCase();
    return index === 0 ? lower : lower[0].toUpperCase() + lower.slice(1);
  }).join('');
  if (!key || !/^\p{L}/u.test(key)) key = `text${key}`;
  return key.slice(0, 80);
}

function setMessage(namespace: string, text: string, keyCache: Map<string, string>): string {
  const cacheKey = `${namespace}\u0000${text}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;

  let target = messages;
  for (const segment of namespace.split('.')) {
    if (!target[segment] || typeof target[segment] !== 'object' || Array.isArray(target[segment])) {
      target[segment] = {};
    }
    target = target[segment] as LocaleMessages;
  }

  const templateKeys: Record<string, string> = {
    'caregiverSupport\u0000{current}/{total}': 'tipPagination',
    'hospital\u0000Dr. {name}': 'doctorName',
    'labReports.id\u0000{percent}%': 'confidencePercent',
    'labReports.trends\u0000{value}': 'trendValue',
    'messages\u0000 · {specialty}': 'specialtyWithSeparator',
    'messages\u0000Message {name}...': 'messagePlaceholder',
    'treatments\u0000{count} scheduled treatments': 'treatmentCountTitle',
    'medicineFinder\u0000{count} medicines found': 'resultsCount',
    'components.bplDonations.patientProfileModal\u0000₹{amount}': 'donationAmountWithCurrency',
    'components.caregiverMarketplace.marketplaceList\u0000₹{amount}': 'hourlyRateWithCurrency',
    'components.dietPlan.dietPlanDashboard\u0000Select {meal}': 'mealSelectionLabel',
    'components.dietPreferences.dietPreferencesForm\u0000Remove {value}': 'removeItemLabel',
  };
  const baseKey = templateKeys[cacheKey] || keyFromText(text);
  let key = baseKey;
  let suffix = 2;
  while (Object.prototype.hasOwnProperty.call(target, key) && target[key] !== text) {
    key = `${baseKey}${suffix++}`;
  }
  target[key] = text;
  keyCache.set(cacheKey, key);
  return key;
}

function componentName(node: ts.FunctionLikeDeclaration): string | null {
  if (ts.isFunctionDeclaration(node)) {
    if (node.name && /^\p{Lu}/u.test(node.name.text)) return node.name.text;
    const isDefaultExport = node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
    if (isDefaultExport && node.parent === node.getSourceFile()) return node.name?.text || 'default';
  }

  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const parent = node.parent;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) && /^\p{Lu}/u.test(parent.name.text)) {
      return parent.name.text;
    }
    if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name) && /^\p{Lu}/u.test(parent.name.text)) {
      return parent.name.text;
    }
  }

  return null;
}

function findComponentOwner(node: ts.Node): ts.FunctionLikeDeclaration | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      (ts.isFunctionDeclaration(current) || ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      componentName(current)
    ) return current;
    current = current.parent;
  }
  return null;
}

function hasTBinding(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node)) &&
      node.name && ts.isIdentifier(node.name) && node.name.text === 't'
    ) found = true;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function getTranslationsBinding(sourceFile: ts.SourceFile): string | null {
  let binding: string | null = null;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)) {
      const callee = node.initializer.expression;
      if (ts.isIdentifier(callee) && callee.text === 'useTranslations') binding = node.name.text;
    }
    if (!binding) ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return binding;
}

function getPlaceholderName(expression: ts.Expression, sourceFile: ts.SourceFile): string {
  const text = expression.getText(sourceFile);
  if (/tipIndex\s*\+\s*1/.test(text)) return 'current';
  if (/tips\.length/.test(text)) return 'total';
  if (/extraction_confidence/.test(text)) return 'percent';
  if (/absoluteChange/.test(text)) return 'value';
  if (/specialty/.test(text)) return 'specialty';
  if (/member_name|full_name/.test(text)) return 'name';
  if (/treatmentCount|searchResults\.length/.test(text)) return 'count';
  if (/donationAmount|hourly_rate/.test(text)) return 'amount';
  if (/MEAL_LABELS/.test(text)) return 'meal';
  if (/\bvalue\b/.test(text)) return 'value';
  return `value${sourceFile.getLineAndCharacterOfPosition(expression.getStart(sourceFile)).character + 1}`;
}

function collectRenderableLiterals(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  addCandidate: (
    node: ts.Node,
    value: string,
    kind?: TextCandidate['kind'],
    placeholders?: TextCandidate['placeholders'],
  ) => void,
) {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    addCandidate(expression, expression.text);
    return;
  }

  if (ts.isTemplateExpression(expression)) {
    const placeholders: NonNullable<TextCandidate['placeholders']> = [];
    let value = expression.head.text;
    for (const span of expression.templateSpans) {
      const name = getPlaceholderName(span.expression, sourceFile);
      placeholders.push({ name, expression: span.expression });
      value += `{${name}}${span.literal.text}`;
    }
    addCandidate(expression, value, 'template', placeholders);
    return;
  }

  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
    collectRenderableLiterals(expression.expression, sourceFile, addCandidate);
    return;
  }

  if (ts.isConditionalExpression(expression)) {
    collectRenderableLiterals(expression.whenTrue, sourceFile, addCandidate);
    collectRenderableLiterals(expression.whenFalse, sourceFile, addCandidate);
    return;
  }

  if (ts.isBinaryExpression(expression)) {
    const operator = expression.operatorToken.kind;
    if (
      operator === ts.SyntaxKind.PlusToken ||
      operator === ts.SyntaxKind.AmpersandAmpersandToken ||
      operator === ts.SyntaxKind.BarBarToken ||
      operator === ts.SyntaxKind.QuestionQuestionToken
    ) {
      if (operator === ts.SyntaxKind.PlusToken) {
        collectRenderableLiterals(expression.left, sourceFile, addCandidate);
      }
      collectRenderableLiterals(expression.right, sourceFile, addCandidate);
    }
  }
}

function hasUseTranslationsImport(sourceFile: ts.SourceFile): boolean {
  return sourceFile.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return false;
    if (statement.moduleSpecifier.text !== 'next-intl') return false;
    const bindings = statement.importClause?.namedBindings;
    return !!bindings && ts.isNamedImports(bindings) && bindings.elements.some((element) => element.name.text === 'useTranslations');
  });
}

function getImportInsertionPoint(sourceFile: ts.SourceFile): number {
  let insertionPoint = 0;
  for (const statement of sourceFile.statements) {
    const isImport = ts.isImportDeclaration(statement);
    const isDirective = ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression);
    if (isImport || isDirective) insertionPoint = statement.end;
  }
  return insertionPoint;
}

function processFile(filePath: string) {
  const original = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const namespace = getNamespace(filePath);
  const candidates: TextCandidate[] = [];
  const candidatePositions = new Set<number>();
  const componentOwners = new Set<ts.FunctionLikeDeclaration>();
  const keyCache = new Map<string, string>();
  const edits: SourceEdit[] = [];
  const textProps = new Set([
    'placeholder', 'title', 'aria-label', 'aria-description', 'alt', 'label', 'description',
    'helperText', 'errorMessage', 'emptyMessage', 'buttonText', 'submitText', 'caption',
  ]);

  const addCandidate = (
    node: ts.Node,
    value: string,
    kind: TextCandidate['kind'] = 'literal',
    placeholders?: TextCandidate['placeholders'],
  ) => {
    const position = node.getStart(sourceFile);
    if (candidatePositions.has(position)) return;
    candidatePositions.add(position);
    const reason = skipReason(value, Boolean(placeholders?.length));
    if (reason) {
      reportSkip(reason, node, sourceFile, value);
      return;
    }
    const owner = findComponentOwner(node);
    if (!owner) {
      reportSkip('text outside a recognized function component', node, sourceFile, value);
      return;
    }
    candidates.push({ node, value, kind, placeholders });
    componentOwners.add(owner);
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const normalized = normalizeJsxText(node.getText(sourceFile));
      if (normalized.trim()) {
        const value = normalized.trim();
        const reason = skipReason(value);
        if (reason) {
          reportSkip(reason, node, sourceFile, value);
        } else {
          const owner = findComponentOwner(node);
          if (!owner) {
            reportSkip('text outside a recognized function component', node, sourceFile, value);
          } else {
            candidates.push({
              node,
              value,
              kind: 'jsxText',
              leadingSpace: normalized.startsWith(' '),
              trailingSpace: normalized.endsWith(' '),
            });
            componentOwners.add(owner);
          }
        }
      }
    } else if (ts.isJsxAttribute(node) && textProps.has(node.name.getText(sourceFile)) && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) {
        addCandidate(node.initializer, node.initializer.text, 'attribute');
      } else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
        collectRenderableLiterals(node.initializer.expression, sourceFile, (literal, value, kind, placeholders) =>
          addCandidate(literal, value, kind, placeholders));
      }
    } else if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      collectRenderableLiterals(node.expression, sourceFile, (literal, value, kind, placeholders) =>
        addCandidate(literal, value, kind, placeholders));
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (candidates.length === 0) return;

  const hasExistingImport = hasUseTranslationsImport(sourceFile);
  const existingTranslationVariable = getTranslationsBinding(sourceFile);
  const translationVariable = existingTranslationVariable || (hasTBinding(sourceFile) ? 'tI18n' : 't');
  if (!existingTranslationVariable && translationVariable !== 't' && ambiguousSamples.length < 40) {
    ambiguousSamples.push(`${path.relative(root, filePath).replace(/\\/g, '/')} [translation variable uses tI18n because t is already bound]`);
  }

  const ownerToName = new Map<ts.FunctionLikeDeclaration, string>();
  for (const owner of componentOwners) ownerToName.set(owner, translationVariable);

  for (const candidate of candidates) {
    const key = setMessage(namespace, candidate.value, keyCache);
    const parameters = candidate.placeholders?.map(({ name, expression }) => `${name}: ${expression.getText(sourceFile)}`);
    const call = parameters?.length
      ? `${translationVariable}('${key}', { ${parameters.join(', ')} })`
      : `${translationVariable}('${key}')`;
    extractedOccurrences += 1;

    if (candidate.kind === 'jsxText') {
      const parts: string[] = [];
      if (candidate.leadingSpace) parts.push("{' '}");
      parts.push(`{${call}}`);
      if (candidate.trailingSpace) parts.push("{' '}");
      edits.push({ start: candidate.node.getStart(sourceFile), end: candidate.node.end, text: parts.join('') });
    } else if (candidate.kind === 'attribute') {
      edits.push({
        start: candidate.node.getStart(sourceFile),
        end: candidate.node.end,
        text: `{${call}}`,
      });
    } else {
      edits.push({ start: candidate.node.getStart(sourceFile), end: candidate.node.end, text: call });
    }
  }

  for (const owner of componentOwners) {
    const functionName = ownerToName.get(owner) || 't';
    if (existingTranslationVariable) continue;
    if (owner.body && ts.isBlock(owner.body)) {
      const bodyStart = owner.body.getStart(sourceFile);
      const bodyLine = sourceFile.getLineAndCharacterOfPosition(bodyStart).line;
      const lineStart = sourceFile.getPositionOfLineAndCharacter(bodyLine, 0);
      const functionIndent = original.slice(lineStart, bodyStart).match(/^[\t ]*/)?.[0] || '';
      edits.push({
        start: bodyStart + 1,
        end: bodyStart + 1,
        text: `\n${functionIndent}  const ${functionName} = useTranslations('${namespace}');`,
      });
    } else if (ts.isArrowFunction(owner) && owner.body) {
      const bodyStart = owner.body.getStart(sourceFile);
      const bodyLine = sourceFile.getLineAndCharacterOfPosition(bodyStart).line;
      const lineStart = sourceFile.getPositionOfLineAndCharacter(bodyLine, 0);
      const functionIndent = original.slice(lineStart, bodyStart).match(/^[\t ]*/)?.[0] || '';
      const innerIndent = `${functionIndent}  `;
      edits.push({
        start: bodyStart,
        end: bodyStart,
        text: `{\n${innerIndent}const ${functionName} = useTranslations('${namespace}');\n${innerIndent}return `,
      });
      edits.push({ start: owner.body.end, end: owner.body.end, text: `;\n${functionIndent}}` });
    } else {
      const line = sourceFile.getLineAndCharacterOfPosition(owner.getStart(sourceFile)).line + 1;
      ambiguousSamples.push(`${path.relative(root, filePath).replace(/\\/g, '/')} :${line} [component function has no editable body]`);
    }
  }

  if (!hasExistingImport) {
    const insertionPoint = getImportInsertionPoint(sourceFile);
    edits.push({
      start: insertionPoint,
      end: insertionPoint,
      text: `\nimport { useTranslations } from 'next-intl';`,
    });
  }

  edits.sort((left, right) => right.start - left.start || right.end - left.end);
  let transformed = original;
  for (const edit of edits) {
    transformed = transformed.slice(0, edit.start) + edit.text + transformed.slice(edit.end);
  }

  if (transformed !== original) {
    fs.writeFileSync(filePath, transformed, 'utf8');
    modifiedFiles.push(path.relative(root, filePath).replace(/\\/g, '/'));
  }
}

const files = [
  ...walkTsx(path.join(root, 'app'), 'app'),
  ...walkTsx(path.join(root, 'components'), 'components'),
].sort();

for (const file of files) processFile(file);

fs.writeFileSync(messagesPath, `${JSON.stringify(messages, null, 2)}\n`, 'utf8');

console.log(`Scanned ${files.length} TSX files.`);
console.log(`Extracted ${extractedOccurrences} visible text occurrences into the English catalog.`);
console.log(`Modified ${modifiedFiles.length} source files.`);
console.log('Modified files:');
for (const file of modifiedFiles) console.log(`  ${file}`);
console.log('Skipped candidates:');
if (skippedCounts.size === 0) console.log('  none');
for (const [reason, count] of skippedCounts) console.log(`  ${reason}: ${count}`);
for (const sample of skippedSamples) console.log(`    ${sample}`);
console.log('Ambiguous cases:');
if (ambiguousSamples.length === 0) console.log('  none');
for (const sample of ambiguousSamples) console.log(`  ${sample}`);
