
const Sentiment = require('sentiment');
const sentiment = new Sentiment();

export function analyzeSentiment(text: string) {
  const result = sentiment.analyze(text);
  // result.score: >0 positive, <0 negative, 0 neutral
  let mood: 'positive' | 'negative' | 'neutral' = 'neutral';
  if (result.score > 0) mood = 'positive';
  else if (result.score < 0) mood = 'negative';
  return { mood, score: result.score, comparative: result.comparative };
}
