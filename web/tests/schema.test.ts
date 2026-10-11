import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const schema = read('../../schema/analysis.schema.json');
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

describe('JSON Schema contract', () => {
  it('demo document conforms', () => {
    const ok = validate(read('../public/samples/demo-match.json'));
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it('rejects a shot without outcome', () => {
    const d = read('../public/samples/demo-match.json');
    delete d.events[1].outcome;
    expect(validate(d)).toBe(false);
  });
});
