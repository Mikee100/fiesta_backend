"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeSentiment = analyzeSentiment;
const Sentiment = require('sentiment');
const sentiment = new Sentiment();
function analyzeSentiment(text) {
    const result = sentiment.analyze(text);
    let mood = 'neutral';
    if (result.score > 0)
        mood = 'positive';
    else if (result.score < 0)
        mood = 'negative';
    return { mood, score: result.score, comparative: result.comparative };
}
//# sourceMappingURL=sentiment.util.js.map