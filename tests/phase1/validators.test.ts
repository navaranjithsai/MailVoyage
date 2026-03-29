import { describe, expect, it } from 'vitest';
import {
  emailPattern,
  emailValidation,
  passwordRules,
  passwordValidation,
  usernameValidation,
} from '../../src/lib/validators';

describe('frontend validators', () => {
  describe('emailPattern', () => {
    it('accepts common valid email addresses', () => {
      expect(emailPattern.test('hello@example.com')).toBe(true);
      expect(emailPattern.test('user.name+tag@sub.domain.com')).toBe(true);
    });

    it('rejects invalid email addresses', () => {
      expect(emailPattern.test('not-an-email')).toBe(false);
      expect(emailPattern.test('missing@tld')).toBe(false);
      expect(emailPattern.test('name@domain.')).toBe(false);
    });
  });

  describe('validation objects', () => {
    it('contains expected user-facing messages', () => {
      expect(emailValidation.required).toContain('required');
      expect(usernameValidation.required).toContain('required');
      expect(passwordValidation.required).toContain('required');
    });
  });

  describe('passwordRules', () => {
    const rulesByKey = Object.fromEntries(passwordRules.map((rule) => [rule.key, rule]));

    it('has stable rule keys used by UI', () => {
      expect(Object.keys(rulesByKey)).toEqual(['minLength', 'upper', 'lower', 'special']);
    });

    it('evaluates each rule correctly', () => {
      expect(rulesByKey.minLength.test('Ab!12345')).toBe(true);
      expect(rulesByKey.minLength.test('Ab!12')).toBe(false);

      expect(rulesByKey.upper.test('Abc')).toBe(true);
      expect(rulesByKey.upper.test('abc')).toBe(false);

      expect(rulesByKey.lower.test('aBC')).toBe(true);
      expect(rulesByKey.lower.test('ABC')).toBe(false);

      expect(rulesByKey.special.test('Abc!')).toBe(true);
      expect(rulesByKey.special.test('Abc123')).toBe(false);
    });
  });
});