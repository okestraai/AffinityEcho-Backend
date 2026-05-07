import { AvatarGenerator } from '../../common/utils/avatar-generator.util';

describe('AvatarGenerator', () => {
  it('should generate avatar with emoji and bg', () => {
    const result = AvatarGenerator.generate();
    expect(result).toHaveProperty('emoji');
    expect(result).toHaveProperty('bg');
    expect(typeof result.emoji).toBe('string');
    expect(typeof result.bg).toBe('string');
  });

  it('should return non-empty emoji', () => {
    const result = AvatarGenerator.generate();
    expect(result.emoji.length).toBeGreaterThan(0);
  });

  it('should produce different results over many calls', () => {
    const emojis = new Set<string>();
    for (let i = 0; i < 50; i++) {
      emojis.add(AvatarGenerator.generate().emoji);
    }
    expect(emojis.size).toBeGreaterThan(1);
  });

  it('should accept a seed parameter', () => {
    const result = AvatarGenerator.generate('test-seed');
    expect(result).toHaveProperty('emoji');
    expect(result).toHaveProperty('bg');
  });
});
