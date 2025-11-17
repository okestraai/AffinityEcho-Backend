export class AvatarGenerator {
  static generate(seed: string): { emoji: string; bg: string } {
    const emojis = ['rocket', 'star', 'lightning', 'fire', 'snowflake', 'rainbow', 'sun', 'moon', 'crystal', 'diamond'];
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#DDA0DD', '#98D8C8', '#F7DC6F'];

    const hash = seed.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return {
      emoji: emojis[hash % emojis.length],
      bg: colors[hash % colors.length],
    };
  }
}