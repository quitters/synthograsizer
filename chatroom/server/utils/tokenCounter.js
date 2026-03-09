/**
 * Approximate token counter for Gemini API
 * Uses a rough estimate of ~4 characters per token
 */

export function countTokens(text) {
  if (!text) return 0;
  // Rough approximation: ~4 characters per token
  // This is a simplification; actual tokenization varies
  return Math.ceil(text.length / 4);
}

export function countMessageTokens(messages) {
  return messages.reduce((total, msg) => {
    // Count content tokens
    let tokens = countTokens(msg.content);
    // Add overhead for message structure (~4 tokens per message)
    tokens += 4;
    // Add speaker name tokens
    tokens += countTokens(msg.agentName);
    return total + tokens;
  }, 0);
}

export function formatTokenCount(count) {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}
