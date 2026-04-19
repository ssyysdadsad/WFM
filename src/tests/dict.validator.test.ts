import { describe, expect, it } from 'vitest';
import { parseDictExtraConfig } from '@/app/lib/validators/dict';

describe('parseDictExtraConfig', () => {
  it('returns null for empty input', () => {
    expect(parseDictExtraConfig('')).toBeNull();
  });

  it('parses object json', () => {
    expect(parseDictExtraConfig('{"color":"#1677ff"}')).toEqual({ color: '#1677ff' });
  });

  it('rejects non-object json', () => {
    expect(() => parseDictExtraConfig('["invalid"]')).toThrow('扩展配置必须是 JSON 对象');
  });
});
