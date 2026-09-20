import {
  GoogleGenAI,
} from "@google/genai";

const DEFAULT_MODEL =
  "gemini-3.6-flash";

const FALLBACK_MODEL =
  "gemini-3.5-flash-lite";

const REQUEST_TIMEOUT_MS =
  30000;

let client: GoogleGenAI | null =
  null;

export function getGeminiClient(): GoogleGenAI {
  if (client) {
    return client;
  }

  const apiKey =
    process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY environment variable.",
    );
  }

  client = new GoogleGenAI({
    apiKey,
  });

  return client;
}

export function getGeminiModel(): string {
  return (
    process.env.GEMINI_MODEL ||
    DEFAULT_MODEL
  );
}

export function getGeminiModelCandidates(): string[] {
  const configuredModel =
    getGeminiModel();

  const models = [
    configuredModel,
    FALLBACK_MODEL,
  ];

  return [
    ...new Set(
      models.filter(Boolean),
    ),
  ];
}

function isTemporaryUnavailableError(
  error: unknown,
): boolean {
  const message =
    error instanceof Error
      ? error.message
      : JSON.stringify(error);

  return (
    message.includes("429") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes(
      "UNAVAILABLE",
    ) ||
    message.includes(
      "overloaded",
    ) ||
    message.includes(
      "high demand",
    ) ||
    message.includes(
      "temporarily",
    )
  );
}

function isTimeoutError(
  error: unknown,
): boolean {
  const message =
    error instanceof Error
      ? error.message
      : JSON.stringify(error);

  return (
    message.toLowerCase().includes(
      "timeout",
    ) ||
    message.toLowerCase().includes(
      "timed out",
    ) ||
    message.toLowerCase().includes(
      "aborted",
    )
  );
}

function wait(
  milliseconds: number,
): Promise<void> {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}

export async function generateGeminiContent(
  contents: string,
): Promise<{
  response: Awaited<
    ReturnType<
      GoogleGenAI["models"]["generateContent"]
    >
  >;
  model: string;
}> {
  const ai =
    getGeminiClient();

  const models =
    getGeminiModelCandidates();

  let lastError: unknown =
    null;

  for (
    let modelIndex = 0;
    modelIndex <
    models.length;
    modelIndex++
  ) {
    const model =
      models[modelIndex];

    try {
      const response =
        await ai.models.generateContent(
          {
            model,

            contents,

            config: {
              responseMimeType:
                "application/json",

              httpOptions: {
                timeout:
                  REQUEST_TIMEOUT_MS,
              },
            },
          },
        );

      return {
        response,
        model,
      };
    } catch (error) {
      lastError = error;

      /*
       * Authentication, invalid model, invalid request,
       * quota and validation errors should not trigger
       * unnecessary model switching.
       */
      const temporary =
        isTemporaryUnavailableError(
          error,
        );

      const timedOut =
        isTimeoutError(
          error,
        );

      const hasNextModel =
        modelIndex <
        models.length - 1;

      if (
        !temporary &&
        !timedOut
      ) {
        break;
      }

      if (!hasNextModel) {
        break;
      }

      /*
       * Small delay before trying the fallback model.
       */
      await wait(1000);
    }
  }

  const message =
    lastError instanceof Error
      ? lastError.message
      : "Unknown Gemini API error.";

  throw new Error(
    `Gemini generation failed. All available generation attempts were unsuccessful: ${message}`,
  );
}