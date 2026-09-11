/* MTG Collection Manager — Cloudflare Worker */

const DEFAULT_PRIMARY_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_FALLBACK_MODEL = "gemini-3.5-flash";
const DEFAULT_FALLBACK_MODEL_2 = "gemini-3.6-flash";

const SINGLE_TIMEOUT_MS = 35000;
const BATCH_TIMEOUT_MS = 60000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const PRIMARY_RETRY_DELAY_MS = 700;

const SCRYFALL_DELAY_MS = 90;
const SCRYFALL = "https://api.scryfall.com";


/* ============================================================
   SINGLE CARD PROMPT
============================================================ */

const SINGLE_PROMPT = `
You are identifying ONE Magic: The Gathering card from a photo.

Your job has two separate parts:

A) identify the CARD NAME when the title is readable in a normal
human writing system;

B) identify the EXACT PRINTING from the printed set code and
collector number.

IMPORTANT RULES:

- If the title is clearly readable in English, Spanish, French,
German, Italian, Portuguese, Japanese, Korean, Simplified Chinese,
Traditional Chinese, Russian, or another normal human language,
the card name is a strong identity signal.

- Then independently read the set code and collector number from
the bottom information line.

- Do NOT invent set code or collector number from memory.

- If the title uses a fictional/special script such as Phyrexian,
Quenya, Dwarvish, Elvish/Tengwar, or another non-standard fantasy
script, do NOT guess the English card name from artwork.

- For fictional/special scripts, set code + collector number are
the strongest identification signals.

- If the title itself is unreadable, name MUST be null.

- Never identify a card from artwork alone.

- Never infer finish from glare.
  foil must always be false.

Before returning JSON, cross-check your own reading:

If name is readable, ask yourself whether the set code and collector
number you extracted really appear on THIS photographed card.

A known card name does NOT justify guessing its printing.

Fields:

- name:
  Printed card title if confidently readable.
  Otherwise null.

- set_code:
  Printed set code, lowercase.
  Otherwise null.

- collector_number:
  Printed collector number only.
  Remove unnecessary leading zeroes.
  Preserve suffix letters when part of the collector number.

- language:
  Standard Scryfall language code when possible:

  en, ja, de, fr, it, es, pt, ru, ko, zhs, zht

  For fictional or special scripts use a lowercase descriptive
  value such as:

  phyrexian
  quenya
  dwarvish
  elvish
  unknown_special

- name_readable:
  true only when the printed title itself is confidently readable.

- special_script:
  true when the title uses a fictional/special script or cannot
  reliably identify the card from normal title reading.

- foil:
  always false.

- confidence:
  overall confidence from 0 to 1.

Return ONLY valid JSON matching the schema.
`;


/* ============================================================
   RAPID BATCH PROMPT
============================================================ */

const BATCH_PROMPT = `
You are identifying multiple Magic: The Gathering cards from ONE
numbered contact sheet.

Each card is labeled:

CARD 1
CARD 2
CARD 3
etc.

Return exactly one result for every visible numbered CARD slot.

For each card independently:

1. If the title is readable in a normal human writing system,
   read the card name.

2. Independently read the printed set code and collector number
   from that SAME card.

3. If the title uses a fictional/special script such as Phyrexian,
   Quenya, Dwarvish, Elvish/Tengwar, or another non-standard fantasy
   script, do NOT guess the English name from artwork.

4. For fictional/special scripts, set code + collector number are
   the strongest identification signals.

5. Do not infer finish.
   foil must always be false.

6. Before returning, cross-check that a readable name and the
   set/collector values appear to belong to the SAME photographed
   card.

7. Do not substitute a printing from memory.

Fields per result:

- slot:
  CARD label number.

- name:
  title if confidently readable,
  otherwise null.

- set_code:
  lowercase printed set code,
  otherwise null.

- collector_number:
  printed collector number.
  Remove unnecessary leading zeroes.
  Preserve suffixes.

- language:
  standard Scryfall language code when possible:

  en, ja, de, fr, it, es, pt, ru, ko, zhs, zht

  For fictional/special scripts use:

  phyrexian
  quenya
  dwarvish
  elvish
  unknown_special

- name_readable:
  true only when the title itself is confidently readable.

- special_script:
  true for fictional/special title scripts.

- foil:
  always false.

- confidence:
  number from 0 to 1.

Do not combine slots.
Do not omit slots.
Do not invent extra slots.

Return ONLY valid JSON matching the schema.
`;


/* ============================================================
   JSON SCHEMAS
============================================================ */

const SINGLE_SCHEMA = {

  type:
    "object",

  properties: {

    name: {
      type:
        "string",
      nullable:
        true
    },

    set_code: {
      type:
        "string",
      nullable:
        true
    },

    collector_number: {
      type:
        "string",
      nullable:
        true
    },

    language: {
      type:
        "string",
      nullable:
        true
    },

    name_readable: {
      type:
        "boolean"
    },

    special_script: {
      type:
        "boolean"
    },

    foil: {
      type:
        "boolean"
    },

    confidence: {
      type:
        "number"
    }
  },

  required: [
    "name",
    "set_code",
    "collector_number",
    "language",
    "name_readable",
    "special_script",
    "foil",
    "confidence"
  ]
};


const BATCH_CARD_SCHEMA = {

  type:
    "object",

  properties: {

    slot: {
      type:
        "integer"
    },

    name: {
      type:
        "string",
      nullable:
        true
    },

    set_code: {
      type:
        "string",
      nullable:
        true
    },

    collector_number: {
      type:
        "string",
      nullable:
        true
    },

    language: {
      type:
        "string",
      nullable:
        true
    },

    name_readable: {
      type:
        "boolean"
    },

    special_script: {
      type:
        "boolean"
    },

    foil: {
      type:
        "boolean"
    },

    confidence: {
      type:
        "number"
    }
  },

  required: [
    "slot",
    "name",
    "set_code",
    "collector_number",
    "language",
    "name_readable",
    "special_script",
    "foil",
    "confidence"
  ]
};


const BATCH_SCHEMA = {

  type:
    "object",

  properties: {

    cards: {

      type:
        "array",

      items:
        BATCH_CARD_SCHEMA
    }
  },

  required: [
    "cards"
  ]
};


/* ============================================================
   CORS
============================================================ */

function corsHeaders(
  origin
) {

  return {

    "Access-Control-Allow-Origin":
      origin ||
      "*",

    "Access-Control-Allow-Methods":
      "POST, GET, OPTIONS",

    "Access-Control-Allow-Headers":
      "content-type, x-app-token",

    "Access-Control-Max-Age":
      "86400",

    "Vary":
      "Origin"
  };
}


/* ============================================================
   JSON RESPONSE
============================================================ */

function json(
  body,
  status,
  origin
) {

  return new Response(
    JSON.stringify(
      body
    ),
    {

      status,

      headers: {

        "Content-Type":
          "application/json",

        ...corsHeaders(
          origin
        )
      }
    }
  );
}


/* ============================================================
   WAIT
============================================================ */

const sleep =
  (
    milliseconds
  ) =>
    new Promise(
      (
        resolve
      ) =>
        setTimeout(
          resolve,
          milliseconds
        )
    );


/* ============================================================
   ARRAYBUFFER → BASE64
============================================================ */

function arrayBufferToBase64(
  buffer
) {

  const bytes =
    new Uint8Array(
      buffer
    );


  let binary =
    "";


  const chunkSize =
    0x8000;


  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {

    binary +=
      String.fromCharCode.apply(
        null,
        bytes.subarray(
          i,
          i + chunkSize
        )
      );
  }


  return btoa(
    binary
  );
}


/* ============================================================
   MODEL CHAIN
============================================================ */

function getModelChain(
  env
) {

  return [
    ...new Set(
      [

        env.GEMINI_MODEL ||
          DEFAULT_PRIMARY_MODEL,

        env.GEMINI_FALLBACK_MODEL ||
          DEFAULT_FALLBACK_MODEL,

        env.GEMINI_FALLBACK_MODEL_2 ||
          DEFAULT_FALLBACK_MODEL_2

      ]
        .map(
          (
            value
          ) =>
            String(
              value ||
              ""
            ).trim()
        )
        .filter(
          Boolean
        )
    )
  ];
}


/* ============================================================
   GEMINI ERROR CLASSIFICATION
============================================================ */

function isTransientStatus(
  status
) {

  return [
    429,
    500,
    502,
    503,
    504
  ].includes(
    status
  );
}


function canFallbackFromStatus(
  status
) {

  return (
    status ===
      404 ||
    isTransientStatus(
      status
    )
  );
}


/* ============================================================
   GEMINI JSON PARSER
============================================================ */

function parseGeminiJson(
  text
) {

  if (
    !text
  ) {

    throw new Error(
      "Gemini returned empty output."
    );
  }


  let cleaned =
    String(
      text
    ).trim();


  if (
    cleaned.startsWith(
      "```"
    )
  ) {

    cleaned =
      cleaned
        .replace(
          /^```(?:json)?\s*/i,
          ""
        )
        .replace(
          /\s*```$/,
          ""
        )
        .trim();
  }


  return JSON.parse(
    cleaned
  );
}


/* ============================================================
   BASIC NORMALIZATION
============================================================ */

function cleanNullableString(
  value
) {

  if (
    value ==
    null
  ) {

    return null;
  }


  const text =
    String(
      value
    ).trim();


  return (
    text ||
    null
  );
}


function normalizeCollectorNumber(
  value
) {

  const text =
    cleanNullableString(
      value
    );


  return (
    text
      ? text.replace(
          /^0+(?=\d)/,
          ""
        )
      : null
  );
}


function normalizeConfidence(
  value
) {

  const number =
    Number(
      value
    );


  return Number.isFinite(
    number
  )
    ? Math.max(
        0,
        Math.min(
          1,
          number
        )
      )
    : 0;
}


function normalizeSingleResult(
  result
) {

  const name =
    cleanNullableString(
      result?.name
    );


  const specialScript =
    !!result?.special_script;


  return {

    name,

    set_code:
      cleanNullableString(
        result?.set_code
      )
        ?.toLowerCase() ||
      null,

    collector_number:
      normalizeCollectorNumber(
        result?.collector_number
      ),

    language:
      cleanNullableString(
        result?.language
      )
        ?.toLowerCase() ||
      "en",

    name_readable:
      !!result?.name_readable &&
      !!name &&
      !specialScript,

    special_script:
      specialScript,

    /*
      Finish is still controlled by the app.
    */
    foil:
      false,

    confidence:
      normalizeConfidence(
        result?.confidence
      )
  };
}


function normalizeBatchResult(
  result
) {

  const cards =
    Array.isArray(
      result?.cards
    )
      ? result.cards
      : [];


  const normalized =
    cards.map(
      (
        card,
        index
      ) => {

        const single =
          normalizeSingleResult(
            card
          );


        return {

          slot:
            Math.max(
              1,
              Math.round(
                Number(
                  card?.slot
                ) ||
                index + 1
              )
            ),

          ...single
        };
      }
    );


  normalized.sort(
    (
      a,
      b
    ) =>
      a.slot -
      b.slot
  );


  return {
    cards:
      normalized
  };
}


/* ============================================================
   GEMINI PAYLOAD
============================================================ */

function buildGeminiPayload({
  prompt,
  schema,
  mime,
  base64
}) {

  return {

    contents: [
      {

        parts: [

          {
            text:
              prompt
          },

          {

            inline_data: {

              mime_type:
                mime,

              data:
                base64
            }
          }
        ]
      }
    ],

    generationConfig: {

      responseMimeType:
        "application/json",

      responseSchema:
        schema,

      thinkingConfig: {

        thinkingLevel:
          "minimal"
      }
    }
  };
}


/* ============================================================
   ONE GEMINI REQUEST
============================================================ */

async function callGeminiModel({
  model,
  apiKey,
  payload,
  timeoutMs
}) {

  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs
    );


  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent?key=` +
    `${encodeURIComponent(apiKey)}`;


  try {

    let response;


    try {

      response =
        await fetch(
          endpoint,
          {

            method:
              "POST",

            headers: {

              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify(
                payload
              ),

            signal:
              controller.signal
          }
        );

    } catch (
      error
    ) {

      if (
        error?.name ===
        "AbortError"
      ) {

        return {

          ok:
            false,

          model,

          kind:
            "timeout",

          transient:
            true,

          canFallback:
            true,

          error:
            "Gemini timeout"
        };
      }


      return {

        ok:
          false,

        model,

        kind:
          "network",

        transient:
          true,

        canFallback:
          true,

        error:
          "Gemini fetch failed: " +
          (
            error?.message ||
            "network error"
          )
      };
    }


    if (
      !response.ok
    ) {

      const detail =
        await response.text();


      return {

        ok:
          false,

        model,

        kind:
          "http",

        status:
          response.status,

        transient:
          isTransientStatus(
            response.status
          ),

        canFallback:
          canFallbackFromStatus(
            response.status
          ),

        error:
          `Gemini error ${response.status}`,

        detail:
          detail.slice(
            0,
            800
          )
      };
    }


    let data;


    try {

      data =
        await response.json();

    } catch {

      return {

        ok:
          false,

        model,

        kind:
          "response",

        transient:
          true,

        canFallback:
          true,

        error:
          "Gemini returned invalid response JSON."
      };
    }


    const text =
      data
        ?.candidates
        ?.[0]
        ?.content
        ?.parts
        ?.[0]
        ?.text;


    if (
      !text
    ) {

      return {

        ok:
          false,

        model,

        kind:
          "empty",

        transient:
          true,

        canFallback:
          true,

        error:
          "No result from Gemini."
      };
    }


    try {

      return {

        ok:
          true,

        model,

        result:
          parseGeminiJson(
            text
          )
      };

    } catch {

      return {

        ok:
          false,

        model,

        kind:
          "parse",

        transient:
          true,

        canFallback:
          true,

        error:
          "Unparseable Gemini output.",

        detail:
          String(
            text
          ).slice(
            0,
            500
          )
      };
    }

  } finally {

    clearTimeout(
      timeout
    );
  }
}


/* ============================================================
   GEMINI FALLBACK ENGINE
============================================================ */

async function callGeminiWithFallback({
  env,
  payload,
  timeoutMs
}) {

  const models =
    getModelChain(
      env
    );


  const attempts =
    [];


  for (
    let modelIndex = 0;
    modelIndex < models.length;
    modelIndex++
  ) {

    const model =
      models[
        modelIndex
      ];


    /*
      Primary model:
      - first attempt
      - one retry on temporary failure

      Fallback models:
      - one attempt each
    */

    const maxAttempts =
      modelIndex ===
      0
        ? 2
        : 1;


    for (
      let attempt = 1;
      attempt <= maxAttempts;
      attempt++
    ) {

      const response =
        await callGeminiModel({

          model,

          apiKey:
            env.GEMINI_API_KEY,

          payload,

          timeoutMs
        });


      attempts.push({

        model,

        attempt,

        ok:
          response.ok,

        status:
          response.status ||
          null,

        kind:
          response.kind ||
          null
      });


      if (
        response.ok
      ) {

        return {

          ok:
            true,

          result:
            response.result,

          model:
            response.model,

          fallbackUsed:
            modelIndex >
            0,

          attempts
        };
      }


      if (
        !response.canFallback
      ) {

        return {

          ok:
            false,

          error:
            response.error,

          detail:
            response.detail ||
            null,

          status:
            response.status ||
            null,

          model:
            response.model,

          attempts
        };
      }


      const retryPrimary =
        modelIndex ===
          0 &&
        attempt <
          maxAttempts &&
        response.transient;


      if (
        retryPrimary
      ) {

        await sleep(
          PRIMARY_RETRY_DELAY_MS
        );


        continue;
      }


      break;
    }
  }


  return {

    ok:
      false,

    error:
      "AI service is temporarily unavailable.",

    detail:
      "All configured Gemini models failed.",

    attempts
  };
}


/* ============================================================
   NAME COMPARISON
============================================================ */

function normalizeName(
  value
) {

  return String(
    value ||
    ""
  )
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    /*
      Double-faced card names from Scryfall may be:

      Front // Back

      The first title is enough for this comparison.
    */
    .replace(
      /\/\/.+$/,
      ""
    )
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .trim()
    .replace(
      /\s+/g,
      " "
    );
}


function namesMatch(
  a,
  b
) {

  const left =
    normalizeName(
      a
    );


  const right =
    normalizeName(
      b
    );


  return (
    !!left &&
    !!right &&
    left === right
  );
}


/* ============================================================
   LANGUAGE / SCRIPT HELPERS
============================================================ */

function isNormalReadableName(
  read
) {

  return (
    !!read?.name &&
    read?.name_readable ===
      true &&
    read?.special_script !==
      true
  );
}


function scryLanguageCode(
  language
) {

  const standard =
    new Set(
      [
        "en",
        "ja",
        "de",
        "fr",
        "it",
        "es",
        "pt",
        "ru",
        "ko",
        "zhs",
        "zht"
      ]
    );


  const value =
    String(
      language ||
      ""
    ).toLowerCase();


  return standard.has(
    value
  )
    ? value
    : null;
}


/* ============================================================
   SCRYFALL
============================================================ */

async function scryGet(
  url
) {

  try {

    const response =
      await fetch(
        url,
        {

          headers: {

            "Accept":
              "application/json",

            "User-Agent":
              "MTGCollectionManager/1.0"
          }
        }
      );


    if (
      !response.ok
    ) {

      return null;
    }


    const data =
      await response.json();


    return data?.object ===
      "error"
      ? null
      : data;

  } catch {

    return null;
  }
}


async function scryExact(
  setCode,
  collectorNumber,
  language
) {

  if (
    !setCode ||
    !collectorNumber
  ) {

    return null;
  }


  const base =
    `${SCRYFALL}/cards/` +
    `${encodeURIComponent(String(setCode).toLowerCase())}/` +
    `${encodeURIComponent(String(collectorNumber))}`;


  const lang =
    scryLanguageCode(
      language
    );


  /*
    Only send standard Scryfall language codes.

    Fictional languages such as Quenya / Dwarvish /
    Phyrexian are not used as URL language suffixes.
  */

  if (
    lang &&
    lang !== "en"
  ) {

    const localized =
      await scryGet(
        `${base}/${lang}`
      );


    if (
      localized
    ) {

      return localized;
    }


    await sleep(
      SCRYFALL_DELAY_MS
    );
  }


  return scryGet(
    base
  );
}


async function scryPrintsByExactNameAndSet(
  name,
  setCode
) {

  if (
    !name ||
    !setCode
  ) {

    return [];
  }


  const escapedName =
    String(
      name
    ).replace(
      /"/g,
      '\\"'
    );


  const query =
    `!"${escapedName}" ` +
    `set:${String(setCode).toLowerCase()}`;


  const result =
    await scryGet(

      `${SCRYFALL}/cards/search?` +
      `q=${encodeURIComponent(query)}` +
      `&unique=prints&order=set`
    );


  return Array.isArray(
    result?.data
  )
    ? result.data
    : [];
}


/* ============================================================
   VALIDATE ONE READ AGAINST SCRYFALL
============================================================ */

async function validateReadWithScryfall(
  read
) {

  if (
    !read
  ) {

    return {

      status:
        "empty",

      read,

      exactCard:
        null
    };
  }


  if (
    !read.set_code ||
    !read.collector_number
  ) {

    return {

      status:
        "incomplete",

      read,

      exactCard:
        null
    };
  }


  const exactCard =
    await scryExact(

      read.set_code,

      read.collector_number,

      read.language
    );


  /*
    SPECIAL SCRIPT / UNREADABLE NAME

    Here we intentionally trust set + collector
    as the strongest evidence.

    This preserves cards such as:
    - Phyrexian
    - Quenya
    - Dwarvish
    - Elvish/Tengwar
    - other special scripts
  */

  if (
    !isNormalReadableName(
      read
    )
  ) {

    return {

      status:
        exactCard
          ? "special_exact"
          : "special_unresolved",

      read,

      exactCard
    };
  }


  /*
    NORMAL READABLE NAME

    Name and exact printing MUST describe
    the same card.
  */

  if (
    exactCard &&
    namesMatch(
      exactCard.name,
      read.name
    )
  ) {

    return {

      status:
        "verified",

      read,

      exactCard
    };
  }


  /*
    Example:

      Gemini:
        Bard, King of Dale
        LTC #344

      Scryfall:
        LTC #344 = Wind-Scarred Crag

    This is now a conflict instead of silently
    accepting Wind-Scarred Crag.
  */

  return {

    status:
      "conflict",

    read,

    exactCard
  };
}


/* ============================================================
   SINGLE CARD CONFLICT REPAIR PROMPT
============================================================ */

function buildSingleRepairPrompt(
  read,
  exactCard
) {

  return `
Re-check the SAME photographed Magic: The Gathering card very carefully.

Your previous reading was:

- name: ${read.name || "null"}
- set_code: ${read.set_code || "null"}
- collector_number: ${read.collector_number || "null"}
- language: ${read.language || "null"}

Scryfall validation found a contradiction:

${
  exactCard
    ? `The printing ${String(read.set_code).toUpperCase()} #${read.collector_number} is "${exactCard.name}", not "${read.name}".`
    : `Scryfall could not find the printing ${String(read.set_code || "?").toUpperCase()} #${read.collector_number || "?"}.`
}

DO NOT trust the previous set code or collector number.

Look again at the BOTTOM information line of the photographed card
and transcribe what is actually printed.

The readable card name is a strong identity clue, but do NOT invent
a printing from memory.

If the title itself is clearly readable:

- preserve or correct the name
- name_readable = true
- special_script = false

If it uses fictional/special script:

- name = null
- name_readable = false
- special_script = true
- focus on set code + collector number

Return the same JSON fields as before.

Return ONLY valid JSON.
`;
}


/* ============================================================
   SECOND GEMINI PASS — SINGLE
============================================================ */

async function repairSingleConflict({
  env,
  image,
  read,
  exactCard
}) {

  const payload =
    buildGeminiPayload({

      prompt:
        buildSingleRepairPrompt(
          read,
          exactCard
        ),

      schema:
        SINGLE_SCHEMA,

      mime:
        image.mime,

      base64:
        image.base64
    });


  const response =
    await callGeminiWithFallback({

      env,

      payload,

      timeoutMs:
        SINGLE_TIMEOUT_MS
    });


  if (
    !response.ok
  ) {

    return {

      ok:
        false,

      response
    };
  }


  return {

    ok:
      true,

    read:
      normalizeSingleResult(
        response.result
      ),

    model:
      response.model,

    fallbackUsed:
      response.fallbackUsed,

    attempts:
      response.attempts
  };
}


/* ============================================================
   SAFE FALLBACK FOR READABLE NAME CONFLICT
============================================================ */

async function safelyResolveReadableConflict(
  read
) {

  if (
    !read?.name
  ) {

    return read;
  }


  /*
    If Gemini appears to have the SET correct but
    the collector number wrong, check whether this
    card has exactly ONE printing in that set.

    If there is only one, we can safely correct the
    collector number without guessing.
  */

  if (
    read.set_code
  ) {

    await sleep(
      SCRYFALL_DELAY_MS
    );


    const candidates =
      await scryPrintsByExactNameAndSet(

        read.name,

        read.set_code
      );


    if (
      candidates.length ===
      1
    ) {

      return {

        ...read,

        set_code:
          candidates[0].set,

        collector_number:
          normalizeCollectorNumber(
            candidates[0].collector_number
          ),

        language:
          read.language ||
          candidates[0].lang ||
          "en",

        verification_status:
          "corrected_from_unique_set_print"
      };
    }
  }


  /*
    We know the CARD identity from the readable name,
    but we do NOT know the exact printing safely.

    Clearing collector_number is deliberate.

    The existing frontend will then resolve by name
    and allow the user to confirm the correct printing
    instead of showing a completely different card.
  */

  return {

    ...read,

    collector_number:
      null,

    verification_status:
      "needs_printing_confirmation"
  };
}


/* ============================================================
   FINALIZE SINGLE CARD
============================================================ */

async function finalizeSingleRead({
  env,
  image,
  initialRead
}) {

  const first =
    await validateReadWithScryfall(
      initialRead
    );


  /*
    Everything is already consistent.
  */

  if (
    first.status !==
    "conflict"
  ) {

    return {

      read: {

        ...initialRead,

        verification_status:
          first.status
      },

      validation:
        first.status,

      repair:
        null
    };
  }


  /*
    Name and printing disagree.

    Run Gemini one more time using the SAME image
    and explicitly tell it what Scryfall found.
  */

  const repair =
    await repairSingleConflict({

      env,

      image,

      read:
        initialRead,

      exactCard:
        first.exactCard
    });


  if (
    repair.ok
  ) {

    await sleep(
      SCRYFALL_DELAY_MS
    );


    const second =
      await validateReadWithScryfall(
        repair.read
      );


    if (
      [
        "verified",
        "special_exact"
      ].includes(
        second.status
      )
    ) {

      return {

        read: {

          ...repair.read,

          verification_status:
            `repaired_${second.status}`
        },

        validation:
          `repaired_${second.status}`,

        repair
      };
    }


    /*
      Gemini corrected something but there is still
      no completely verified exact printing.

      Keep the readable card identity but do NOT allow
      the bad collector number to select another card.
    */

    if (
      isNormalReadableName(
        repair.read
      )
    ) {

      const safe =
        await safelyResolveReadableConflict(
          repair.read
        );


      return {

        read:
          safe,

        validation:
          safe.verification_status,

        repair
      };
    }
  }


  /*
    Repair request failed.

    Still protect against displaying the wrong card.
  */

  const safe =
    await safelyResolveReadableConflict(
      initialRead
    );


  return {

    read:
      safe,

    validation:
      safe.verification_status,

    repair
  };
}


/* ============================================================
   RAPID BATCH REPAIR PROMPT
============================================================ */

function buildBatchRepairPrompt(
  conflicts
) {

  const lines =
    conflicts
      .map(
        ({
          read,
          exactCard
        }) => {

          const mismatch =
            exactCard
              ? `${String(read.set_code).toUpperCase()} #${read.collector_number} resolves to "${exactCard.name}"`
              : `${String(read.set_code || "?").toUpperCase()} #${read.collector_number || "?"} was not found`;


          return (

            `CARD ${read.slot}: ` +
            `previously name="${read.name || "null"}", ` +
            `set=${read.set_code || "null"}, ` +
            `collector=${read.collector_number || "null"}; ` +
            `Scryfall says ${mismatch}.`
          );
        }
      )
      .join(
        "\n"
      );


  return `
Re-check ONLY the conflicting CARD slots below in the SAME
numbered contact sheet.

${lines}

For each listed slot, inspect that card's bottom information line
again.

Do NOT reuse the previous collector number simply because it was
returned before.

If the title is normally readable:

- preserve/correct the title
- independently re-read set code
- independently re-read collector number
- name_readable = true
- special_script = false

If the title uses fictional/special script:

- do not guess the English name
- name = null
- name_readable = false
- special_script = true
- use set + collector as the strongest signals

Return exactly one result for each listed slot.

Do not return the non-conflicting slots.

Use the normal batch fields.

Return ONLY valid JSON.
`;
}


/* ============================================================
   SECOND GEMINI PASS — RAPID BATCH
============================================================ */

async function repairBatchConflicts({
  env,
  image,
  conflicts
}) {

  if (
    !conflicts.length
  ) {

    return null;
  }


  const repairSchema = {

    type:
      "object",

    properties: {

      cards: {

        type:
          "array",

        items:
          BATCH_CARD_SCHEMA
      }
    },

    required: [
      "cards"
    ]
  };


  const payload =
    buildGeminiPayload({

      prompt:
        buildBatchRepairPrompt(
          conflicts
        ),

      schema:
        repairSchema,

      mime:
        image.mime,

      base64:
        image.base64
    });


  const response =
    await callGeminiWithFallback({

      env,

      payload,

      timeoutMs:
        BATCH_TIMEOUT_MS
    });


  if (
    !response.ok
  ) {

    return {

      ok:
        false,

      response
    };
  }


  return {

    ok:
      true,

    cards:
      normalizeBatchResult(
        response.result
      ).cards,

    model:
      response.model,

    fallbackUsed:
      response.fallbackUsed,

    attempts:
      response.attempts
  };
}


/* ============================================================
   FINALIZE RAPID BATCH
============================================================ */

async function finalizeBatchReads({
  env,
  image,
  initialCards
}) {

  const validations =
    [];


  const conflicts =
    [];


  /*
    Validate every slot with Scryfall.
  */

  for (
    const read of initialCards
  ) {

    const checked =
      await validateReadWithScryfall(
        read
      );


    validations.push({

      slot:
        read.slot,

      status:
        checked.status
    });


    if (
      checked.status ===
      "conflict"
    ) {

      conflicts.push({

        read,

        exactCard:
          checked.exactCard
      });
    }


    await sleep(
      SCRYFALL_DELAY_MS
    );
  }


  /*
    No conflicts.
  */

  if (
    !conflicts.length
  ) {

    return {

      cards:
        initialCards.map(
          (
            read
          ) => ({

            ...read,

            verification_status:
              validations.find(
                (
                  validation
                ) =>
                  validation.slot ===
                  read.slot
              )?.status ||
              "unchecked"
          })
        ),

      repair:
        null
    };
  }


  /*
    Re-check all conflicting cards in ONE extra Gemini
    call instead of making one AI request per card.
  */

  const repair =
    await repairBatchConflicts({

      env,

      image,

      conflicts
    });


  const repairedBySlot =
    new Map(
      (
        repair?.ok
          ? repair.cards
          : []
      ).map(
        (
          card
        ) => [
          card.slot,
          card
        ]
      )
    );


  const conflictSlots =
    new Set(
      conflicts.map(
        (
          item
        ) =>
          item.read.slot
      )
    );


  const output =
    [];


  for (
    const original of initialCards
  ) {

    /*
      This slot never had a conflict.
    */

    if (
      !conflictSlots.has(
        original.slot
      )
    ) {

      output.push({

        ...original,

        verification_status:
          validations.find(
            (
              validation
            ) =>
              validation.slot ===
              original.slot
          )?.status ||
          "unchecked"
      });


      continue;
    }


    /*
      Gemini returned a repaired reading.
    */

    const candidate =
      repairedBySlot.get(
        original.slot
      );


    if (
      candidate
    ) {

      const checked =
        await validateReadWithScryfall(
          candidate
        );


      if (
        [
          "verified",
          "special_exact"
        ].includes(
          checked.status
        )
      ) {

        output.push({

          ...candidate,

          verification_status:
            `repaired_${checked.status}`
        });


        await sleep(
          SCRYFALL_DELAY_MS
        );


        continue;
      }


      /*
        Normal-language card where the name appears good,
        but exact printing still conflicts.
      */

      if (
        isNormalReadableName(
          candidate
        )
      ) {

        const safe =
          await safelyResolveReadableConflict(
            candidate
          );


        /*
          We only allow Rapid Batch to auto-resolve if
          an exact collector number was safely recovered.

          Rapid Batch adds cards in bulk, so being conservative
          here is important for prices and exports.
        */

        if (
          safe.collector_number
        ) {

          output.push(
            safe
          );

        } else {

          /*
            Force this Rapid Batch slot into "needs review".

            We keep the detected name in an extra debugging field,
            but remove the normal identification fields so the
            existing frontend cannot accidentally resolve and add
            a random printing.
          */

          output.push({

            ...safe,

            name:
              null,

            set_code:
              null,

            collector_number:
              null,

            confidence:
              0,

            detected_name:
              candidate.name,

            verification_status:
              "conflict_needs_review"
          });
        }


        await sleep(
          SCRYFALL_DELAY_MS
        );


        continue;
      }
    }


    /*
      Could not repair safely.

      Do NOT let Rapid Batch add an incorrect printing.
    */

    output.push({

      ...original,

      name:
        null,

      set_code:
        null,

      collector_number:
        null,

      confidence:
        0,

      detected_name:
        original.name,

      verification_status:
        "conflict_needs_review"
    });
  }


  return {

    cards:
      output,

    repair
  };
}


/* ============================================================
   ORIGIN CHECK
============================================================ */

function checkOrigin(
  origin,
  allowed
) {

  return !(
    allowed &&
    origin &&
    origin !== allowed
  );
}


/* ============================================================
   RATE LIMIT
============================================================ */

async function checkRateLimit(
  request,
  env
) {

  if (
    !env.RATE_LIMITER
  ) {

    return true;
  }


  const ip =
    request.headers.get(
      "CF-Connecting-IP"
    ) ||
    "anon";


  const result =
    await env.RATE_LIMITER.limit({

      key:
        ip
    });


  return !!result.success;
}


/* ============================================================
   READ IMAGE
============================================================ */

async function readImage(
  request
) {

  const buffer =
    await request.arrayBuffer();


  if (
    !buffer.byteLength ||
    buffer.byteLength >
      MAX_IMAGE_BYTES
  ) {

    throw new Error(
      "bad image size"
    );
  }


  return {

    buffer,

    base64:
      arrayBufferToBase64(
        buffer
      ),

    mime:
      request.headers.get(
        "Content-Type"
      ) ||
      "image/jpeg"
  };
}


/* ============================================================
   SINGLE IDENTIFICATION
============================================================ */

async function identifySingle({
  env,
  image
}) {

  const payload =
    buildGeminiPayload({

      prompt:
        SINGLE_PROMPT,

      schema:
        SINGLE_SCHEMA,

      mime:
        image.mime,

      base64:
        image.base64
    });


  const response =
    await callGeminiWithFallback({

      env,

      payload,

      timeoutMs:
        SINGLE_TIMEOUT_MS
    });


  if (
    !response.ok
  ) {

    return response;
  }


  const initialRead =
    normalizeSingleResult(
      response.result
    );


  /*
    Scryfall validation happens BEFORE the result
    goes back to the browser.
  */

  const finalized =
    await finalizeSingleRead({

      env,

      image,

      initialRead
    });


  return {

    ...response,

    result:
      finalized.read,

    validation:
      finalized.validation,

    repair_model:
      finalized.repair?.model ||
      null
  };
}


/* ============================================================
   RAPID BATCH IDENTIFICATION
============================================================ */

async function identifyBatch({
  env,
  image
}) {

  const payload =
    buildGeminiPayload({

      prompt:
        BATCH_PROMPT,

      schema:
        BATCH_SCHEMA,

      mime:
        image.mime,

      base64:
        image.base64
    });


  const response =
    await callGeminiWithFallback({

      env,

      payload,

      timeoutMs:
        BATCH_TIMEOUT_MS
    });


  if (
    !response.ok
  ) {

    return response;
  }


  const normalized =
    normalizeBatchResult(
      response.result
    );


  const finalized =
    await finalizeBatchReads({

      env,

      image,

      initialCards:
        normalized.cards
    });


  return {

    ...response,

    result: {

      cards:
        finalized.cards
    },

    repair_model:
      finalized.repair?.model ||
      null
  };
}


/* ============================================================
   CLOUDFLARE WORKER
============================================================ */

export default {

  async fetch(
    request,
    env
  ) {

    const url =
      new URL(
        request.url
      );


    const origin =
      request.headers.get(
        "Origin"
      );


    const allowed =
      env.ALLOWED_ORIGIN ||
      "";


    const responseOrigin =
      allowed ||
      origin;


    /* ========================================================
       CORS PREFLIGHT
    ======================================================== */

    if (
      request.method ===
      "OPTIONS"
    ) {

      return new Response(
        null,
        {

          status:
            204,

          headers:
            corsHeaders(
              responseOrigin
            )
        }
      );
    }


    /* ========================================================
       HEALTH
    ======================================================== */

    if (
      url.pathname ===
        "/health" &&
      request.method ===
        "GET"
    ) {

      const models =
        getModelChain(
          env
        );


      return json(
        {

          ok:
            true,

          endpoints: [
            "/identify",
            "/identify-batch"
          ],

          model:
            models[0] ||
            null,

          models: {

            primary:
              models[0] ||
              null,

            fallbacks:
              models.slice(
                1
              )
          },

          validation:
            "scryfall-cross-check-v1",

          conflict_repair:
            true,

          ratelimit:
            !!env.RATE_LIMITER
        },

        200,

        responseOrigin
      );
    }


    /* ========================================================
       VALID ROUTES
    ======================================================== */

    const isSingle =
      url.pathname ===
      "/identify";


    const isBatch =
      url.pathname ===
      "/identify-batch";


    if (
      request.method !==
        "POST" ||
      (
        !isSingle &&
        !isBatch
      )
    ) {

      return json(
        {

          error:
            "not found"
        },

        404,

        responseOrigin
      );
    }


    /* ========================================================
       ORIGIN CHECK
    ======================================================== */

    if (
      !checkOrigin(
        origin,
        allowed
      )
    ) {

      return json(
        {

          error:
            "forbidden origin"
        },

        403,

        allowed
      );
    }


    /* ========================================================
       APP TOKEN
    ======================================================== */

    if (
      !env.APP_TOKEN ||
      request.headers.get(
        "x-app-token"
      ) !== env.APP_TOKEN
    ) {

      return json(
        {

          error:
            "unauthorized"
        },

        401,

        responseOrigin
      );
    }


    /* ========================================================
       RATE LIMIT
    ======================================================== */

    try {

      const allowedByRateLimit =
        await checkRateLimit(
          request,
          env
        );


      if (
        !allowedByRateLimit
      ) {

        return json(
          {

            error:
              "rate limited — too many scans, wait a moment and retry"
          },

          429,

          responseOrigin
        );
      }

    } catch (
      error
    ) {

      /*
        Do not break scanning if the optional
        Cloudflare limiter itself fails.
      */

      console.error(
        "Rate limiter error:",
        error
      );
    }


    /* ========================================================
       GEMINI CONFIG
    ======================================================== */

    if (
      !env.GEMINI_API_KEY
    ) {

      return json(
        {

          error:
            "server not configured (no GEMINI_API_KEY)"
        },

        500,

        responseOrigin
      );
    }


    /* ========================================================
       IMAGE
    ======================================================== */

    let image;


    try {

      image =
        await readImage(
          request
        );

    } catch {

      return json(
        {

          error:
            "bad image size"
        },

        400,

        responseOrigin
      );
    }


    /* ========================================================
       IDENTIFY + VERIFY
    ======================================================== */

    let result;


    try {

      result =
        isBatch
          ? await identifyBatch({
              env,
              image
            })
          : await identifySingle({
              env,
              image
            });

    } catch (
      error
    ) {

      console.error(
        "Identification error:",
        error
      );


      return json(
        {

          error:
            "AI identification failed",

          detail:
            error?.message ||
            "unknown error"
        },

        502,

        responseOrigin
      );
    }


    /* ========================================================
       GEMINI FAILED
    ======================================================== */

    if (
      !result.ok
    ) {

      const hasTemporaryFailure =
        result.attempts
          ?.some(
            (
              attempt
            ) =>

              attempt.kind ===
                "timeout" ||

              attempt.kind ===
                "network" ||

              isTransientStatus(
                attempt.status
              )
          );


      return json(
        {

          error:
            result.error ||
            "AI identification failed",

          detail:
            result.detail ||
            null,

          attempts:
            result.attempts ||
            []
        },

        hasTemporaryFailure
          ? 503
          : 502,

        responseOrigin
      );
    }


   /* ========================================================
   SUCCESS
======================================================== */

return json(
  {

    ok:
      true,

    result:
      result.result,

    /*
      Debugging fields.
      Existing frontend can safely ignore them.
    */

    model:
      result.model,

    fallback_used:
      !!result.fallbackUsed,

    validation:
      (
        "validation" in result &&
        result.validation
      )
        ? result.validation
        : "scryfall-cross-check-v1",

    repair_model:
      (
        "repair_model" in result &&
        result.repair_model
      )
        ? result.repair_model
        : null,

    attempts:
      result.attempts
  },

  200,

  responseOrigin
);
  }
};