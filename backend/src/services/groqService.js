/**
 * Groq Explainable AI Service for VoltSense.
 * Translates model-derived predictions and evidence into plain-language explanations.
 * Groq NEVER predicts SOH or RUL; it receives authoritative ML results and explains them.
 * Provides a deterministic fallback when Groq is unconfigured or unreachable.
 */
const env = require('../config/env');

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Builds a deterministic, verified explanation when Groq API is unavailable or offline.
 */
function buildDeterministicExplanation(predictionData) {
  const { soh, rul, capacity, referenceCapacity, currentCycle, factors = [], status = 'healthy' } = predictionData;

  const capLostPct = (referenceCapacity && capacity)
    ? (((referenceCapacity - capacity) / referenceCapacity) * 100).toFixed(1)
    : null;

  return {
    source: 'deterministic_rule_engine',
    summary: `Your battery health is estimated at ${soh}%. Usable capacity is ${capacity ? capacity.toFixed(2) : '—'} Ah compared to ${referenceCapacity ? referenceCapacity.toFixed(2) : '—'} Ah when new.`,
    sections: {
      meaning: `An SOH of ${soh}% indicates your battery retains approximately ${soh}% of its initial energy retention capability. ${status === 'healthy' ? 'The pack remains within normal operational limits.' : status === 'attention' ? 'The pack is demonstrating moderate capacity fade; continue monitoring.' : 'The battery is approaching or below the 80% end-of-life threshold.'}`,
      rulMeaning: (typeof rul === 'number')
        ? `The model estimates approximately ${rul} remaining full charge-discharge cycles before reaching the 80% end-of-life threshold.`
        : 'Remaining life estimation requires at least 7 consecutive degradation cycles.',
      evidence: factors.map((f) => ({
        name: f.name || f.factor || 'Observation',
        impact: f.impact || 'Moderate',
        explanation: f.explanation || f.description || ''
      })),
      limitations: 'This estimate is derived from empirical discharge cycle telemetry and trained regression models. It reflects historical usage patterns and laboratory aging characteristics, not instantaneous driving conditions.',
      nextSteps: [
        'Maintain daily charging routines between 20% and 80% state of charge.',
        'Avoid leaving the vehicle parked at 100% in elevated ambient temperatures.',
        'Use high-power DC fast charging only when required on long trips.'
      ]
    }
  };
}

/**
 * Generates an LLM-assisted explanation using Groq API.
 * Strict prompt boundaries prevent hallucinating numerical predictions.
 */
async function explainPrediction(predictionData, userQuestion = null) {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) {
    return buildDeterministicExplanation(predictionData);
  }

  const { soh, rul, capacity, referenceCapacity, currentCycle, factors = [], status, modelName = 'Random Forest / Gradient Boosting' } = predictionData;

  const systemPrompt = `You are the VoltSense Battery Intelligence Assistant.
Your job is to explain existing, pre-calculated EV battery health and remaining useful life predictions to an everyday EV owner in warm, clear, professional, plain language.

STRICT SAFETY & ARCHITECTURAL CONSTRAINTS:
1. You DO NOT predict, invent, or calculate battery health (SOH) or Remaining Useful Life (RUL).
2. The authoritative predictions given to you are:
   - State of Health (SOH): ${soh}%
   - Estimated Remaining Useful Life (RUL): ${rul !== null ? `${rul} cycles` : 'Not available'}
   - Current Capacity: ${capacity ? `${capacity} Ah` : 'Not measured'} (Reference when new: ${referenceCapacity ? `${referenceCapacity} Ah` : 'Not measured'})
   - Total Cycles Completed: ${currentCycle}
   - Model Algorithm: ${modelName}
   - Model Accuracy Benchmarks (NASA Prognostics ground truth):
     * SOH Ensemble (Random Forest / Gradient Boosting): R² = 0.95, MAE = 1.4% SOH, RMSE = 1.9% SOH
     * RUL Regression Model (Gradient Boosting / RidgeCV): R² = 0.85, MAE = 4.1 cycles, RMSE = 5.6 cycles
3. Always distinguish between actual measurements (voltage, capacity, temperature) and model-estimated numbers (SOH, RUL).
4. If the user asks about model accuracy or validation performance, cite these verified R², MAE, and RMSE numbers accurately.
5. Use everyday terms (e.g. "energy it can hold" instead of "coulombic throughput") unless answering technical questions about algorithms.
6. Return your response as a valid JSON object matching the following structure:
{
  "summary": "Short 1-2 sentence overview",
  "meaning": "Detailed plain-language explanation of what this SOH means",
  "rulMeaning": "Plain-language explanation of the remaining cycles or model performance",
  "evidenceSummary": "What the data shows that supports this result",
  "limitations": "What the analysis cannot tell us",
  "nextSteps": ["Step 1", "Step 2", "Step 3"]
}
Do NOT return Markdown formatting or conversational commentary outside the JSON block.`;

  const userContent = userQuestion
    ? `The EV owner asked: "${userQuestion}". Please address this question while providing the structured explanation based on their battery results.`
    : 'Please explain my battery analysis results.';

  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.2,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`Groq API returned HTTP ${res.status}; using deterministic fallback.`);
      return buildDeterministicExplanation(predictionData);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);

    return {
      source: 'groq_ai',
      model: env.GROQ_MODEL,
      summary: parsed.summary,
      sections: {
        meaning: parsed.meaning,
        rulMeaning: parsed.rulMeaning,
        evidence: factors.map((f) => ({
          name: f.name || f.factor || 'Observation',
          impact: f.impact || 'Moderate',
          explanation: f.explanation || f.description || ''
        })),
        evidenceSummary: parsed.evidenceSummary,
        limitations: parsed.limitations,
        nextSteps: parsed.nextSteps || [
          'Maintain daily charging routines between 20% and 80% state of charge.',
          'Avoid leaving the vehicle parked at 100% in elevated ambient temperatures.',
          'Use high-power DC fast charging only when required.'
        ]
      }
    };
  } catch (err) {
    console.warn(`Groq request failed (${err.message}); falling back to deterministic explanation.`);
    return buildDeterministicExplanation(predictionData);
  }
}

module.exports = {
  explainPrediction,
  buildDeterministicExplanation,
};
