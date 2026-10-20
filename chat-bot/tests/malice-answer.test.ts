import { parseMaliceAnswer } from '../src/core/malice-answer';

test('reads the model verdict, and takes anything else as no', () => {
  expect(parseMaliceAnswer(' {"malicious": true, "reason": "性暗示"} ')).toEqual({
    malicious: true,
    reason: '性暗示',
  });
  expect(parseMaliceAnswer('{"malicious": "yes", "reason": 1}')).toEqual({
    malicious: false,
    reason: '',
  });
  expect(parseMaliceAnswer('是恶意的')).toEqual({ malicious: false, reason: '' });
});
