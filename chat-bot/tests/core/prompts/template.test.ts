import { fillTemplate } from '../../../src/core/prompts/template';

describe('fillTemplate', () => {
  it('fills each {{key}} it has a value for, as many times as it appears, and leaves the others', () => {
    expect(fillTemplate('{{a}}-{{b}}-{{a}}-{{c}}', { a: 'x', b: 2 })).toBe('x-2-x-{{c}}');
  });

  it('fills an empty string in, and a number as its digits', () => {
    expect(fillTemplate('[{{a}}][{{n}}]', { a: '', n: 0 })).toBe('[][0]');
  });

  it('leaves a key set to undefined as it is by default, and fills 「undefined」 when asked by presence', () => {
    const values = { a: undefined };
    expect(fillTemplate('{{a}}', values)).toBe('{{a}}');
    expect(fillTemplate('{{a}}', values, { fillWhen: 'defined' })).toBe('{{a}}');
    expect(fillTemplate('{{a}}', values, { fillWhen: 'present' })).toBe('undefined');
  });

  it('leaves a key that is not in the values as it is either way', () => {
    expect(fillTemplate('{{a}}', {}, { fillWhen: 'present' })).toBe('{{a}}');
    expect(fillTemplate('{{a}}', {})).toBe('{{a}}');
  });

  it('only reads word characters between the braces', () => {
    expect(fillTemplate('{{ a }} {{a-b}}', { a: 'x' })).toBe('{{ a }} {{a-b}}');
  });
});
