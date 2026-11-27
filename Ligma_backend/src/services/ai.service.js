import axios from "axios";
import config from "../config/env.config.js";
import logger from "../utils/logger.util.js";

const CLASSIFIER_SYSTEM_PROMPT = [
  "You classify short notes from a team brainstorming canvas.",
  "Reply with exactly one word from this list and nothing else: Action, Decision, Question, Information.",
  "Action: something someone needs to do (a task, a to-do, an assignment).",
  "Decision: a choice that has been made or agreed.",
  "Question: an open question the team still needs to answer.",
  "Information: a fact, note or context that is none of the above.",
].join("\n");

const CATEGORY_BY_WORD = {
  action: "Action",
  decision: "Decision",
  question: "Question",
  information: "Information",
  info: "Information",
};

// Robust to "**Question**", "question.", "Answer: Decision", "Action - ..."
// and casing: the first recognised category word wins. Returns null when
// the reply names no category.
const parseClassification = (raw) => {
  const words = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return null;
  if (CATEGORY_BY_WORD[words[0]]) return CATEGORY_BY_WORD[words[0]];

  // Tolerate a short lead-in such as "Category: Question" / "Answer - Action".
  for (const word of words.slice(1, 4)) {
    if (CATEGORY_BY_WORD[word]) return CATEGORY_BY_WORD[word];
  }
  return null;
};

const classifyWithOpenRouter = async (text, { strict = false } = {}) => {
  // Short-circuit when no API key is configured (development mode)
  if (!config.OPENROUTER_API_KEY) return null;

  const url = `${config.OPENROUTER_BASE_URL}${config.OPENROUTER_CHAT_ENDPOINT}`;

  const system = { role: "system", content: CLASSIFIER_SYSTEM_PROMPT };

  const user = {
    role: "user",
    content: `Classify the following text:\n\n${text}\n\nRespond only with one of: Action, Decision, Question, Information`,
  };

  try {
    const resp = await axios.post(
      url,
      {
        model: config.OPENROUTER_MODEL,
        messages: [system, user],
        max_tokens: 16,
        temperature: 0.0,
      },
      {
        headers: {
          Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    const choices = resp?.data?.choices || resp?.data?.output || null;
    const textOut = choices && choices[0] && (choices[0].message?.content || choices[0].text || "");
    if (!textOut) {
      if (strict) {
        throw new Error("OpenRouter returned an empty classification response");
      }

      return null;
    }

    const cleaned = textOut.trim();
    const category = parseClassification(cleaned);
    if (category) return category;
    if (strict) {
      throw new Error(`OpenRouter returned an unsupported classification: ${cleaned}`);
    }

    return null;
  } catch (err) {
    const friendlyMessage = toFriendlyAiErrorMessage(err);

    logger.warn("AI classify failed", {
      status: err.response?.status,
      code: err.code,
      data: err.response?.data,
      message: err.message,
    });

    if (strict) {
      const friendlyErr = new Error(friendlyMessage);
      friendlyErr.statusCode = err.response?.status || 503;
      friendlyErr.cause = err;
      throw friendlyErr;
    }

    return null;
  }
};

// Maps low-level axios/network errors to messages a user can actually act on,
// instead of leaking things like "timeout of 10000ms exceeded".
const toFriendlyAiErrorMessage = (err) => {
  // No internet / DNS not resolving
  if (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") {
    return "No internet connection detected, or DNS could not be resolved. Please check your connection and try again.";
  }

  // Connection actively refused/reset
  if (err.code === "ECONNREFUSED" || err.code === "ECONNRESET") {
    return "Could not connect to the AI service. Please try again in a moment.";
  }

  // Our own axios timeout (10s) — slow/no internet OR OpenRouter itself slow
  if (err.code === "ECONNABORTED" || /timeout/i.test(err.message || "")) {
    return "The AI classification request timed out. This may be due to a slow connection. Please try again.";
  }

  // OpenRouter responded but with an error status
  if (err.response?.status) {
    const status = err.response.status;
  if (status === 401 || status === 403) {
  return "The AI service could not be reached due to a configuration issue. Please contact your workspace administrator.";
}
    if (status === 429) {
      return "The AI service is temporarily busy. Please try again shortly.";
    }
    return `The AI service returned an error (status ${status}).  Please try again.`;
  }

  return "AI classification is currently unavailable. Please try again.";
};

export { classifyWithOpenRouter, parseClassification, CLASSIFIER_SYSTEM_PROMPT };

export default { classifyWithOpenRouter, parseClassification };
