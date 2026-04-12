import { expect, type Page } from '@playwright/test';

export const STEP_TITLES = [
  'I. Identité',
  'II. Atmosphère',
  'III. Le Fardeau',
  "IV. L'Entrave",
  'V. Le Désir',
  'VI. Le Combat',
  'VII. Le Troupeau',
  "VIII. L'Éternité",
  'IX. Le Réceptacle',
  'X. Invocation',
] as const;

const STEP_IDS = [
  'name',
  'mood',
  'weight',
  'fear',
  'desire',
  'sacrifice',
  'social',
  'eternity',
  'format',
  'question',
] as const;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function safeJsonParse(raw: string | null): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function installPhase8ApiMocks(
  page: Page,
  runContext = { count: 1 },
) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();

    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: 200, headers: corsHeaders() });
    }

    if (request.method() !== 'POST') {
      return route.continue();
    }

    const body = safeJsonParse(request.postData());
    const isGuardian =
      body?.mode === 'guardian' ||
      (!body?.questionText && Boolean(body?.step || body?.stepId));

    if (isGuardian) {
      return route.fulfill({
        status: 200,
        headers: corsHeaders(),
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          mode: 'guardian',
          json: { comment: 'Seuil ouvert.', isSafe: true, confidence: 1 },
        }),
      });
    }

    const run = runContext.count++;
    const finalReveal = {
      quote: `Citation héroïque du RUN ${run}`,
      chapter: 'RÉVÉLATION',
      author: 'Zarathoustra',
      central_tension: `Tension centrale du RUN ${run}`,
      reversal: `Renversement du RUN ${run}`,
      imperative: `Tiens ta ligne RUN ${run}`,
      return_axis: `Retour RUN ${run}`,
      explanation_short: `Interprétation courte du RUN ${run}`,
      explanation_long: `Prose gouvernée du RUN ${run}. Le cycle se referme sans fantôme.`,
      citations: [`Source A RUN ${run}`, `Source B RUN ${run}`],
      confidence: 0.94,
      blocks: [],
    };

    return route.fulfill({
      status: 200,
      headers: corsHeaders(),
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        structuredUsed: true,
        seed: `e2e-run-${run}`,
        visualParams: { seed: `e2e-run-${run}` },
        interpretation: finalReveal.explanation_short,
        finalReveal,
        quote: finalReveal.quote,
        chapter: finalReveal.chapter,
        author: finalReveal.author,
        central_tension: finalReveal.central_tension,
        reversal: finalReveal.reversal,
        imperative: finalReveal.imperative,
        return_axis: finalReveal.return_axis,
        explanation_short: finalReveal.explanation_short,
        explanation_long: finalReveal.explanation_long,
        citations: finalReveal.citations,
        hermeneutic: {
          anchors: finalReveal.citations.map((claim, index) => ({
            claim,
            motif: claim,
            citation_id: `citation-${run}-${index}`,
          })),
        },
        json: finalReveal,
      }),
    });
  });
}

async function fillStep(page: Page, index: number, runPrefix: string) {
  const stepId = STEP_IDS[index];
  const isTextInput = [0, 3, 9].includes(index);

  if (isTextInput) {
    const input = page.getByTestId('step-input');
    await input.waitFor({ state: 'visible', timeout: 15000 });
    await input.fill(`${runPrefix} - Etape ${index}`);
  } else if (stepId === 'format') {
    const formatBtn = page.getByTestId('choice-format-0');
    await formatBtn.waitFor({ state: 'visible', timeout: 15000 });
    await formatBtn.click({ force: true });
  } else {
    const cardBtn = page.locator('button[data-testid^="choice-"]').first();
    await cardBtn.waitFor({ state: 'visible', timeout: 15000 });
    await cardBtn.click({ force: true });
  }
}

export async function playRitual(page: Page, runPrefix = 'Test') {
  for (let i = 0; i < 10; i++) {
    await expect(page.getByTestId('step-title')).toBeVisible({
      timeout: 25000,
    });

    await fillStep(page, i, runPrefix);

    const confirmBtn = page.getByTestId('btn-confirm');
    await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
    await confirmBtn.click({ force: true });

    if (i < 9) {
      const nextBtn = page.getByTestId('btn-next');
      await nextBtn.waitFor({ state: 'visible', timeout: 25000 });
      await nextBtn.click({ force: true });
    }
  }
}

export async function assertFinalReveal(page: Page, run: number) {
  const panel = page.getByTestId('reveal-panel');
  await expect(panel).toBeVisible({ timeout: 35000 });
  await expect(page.getByTestId('reveal-quote')).toContainText(
    `Citation héroïque du RUN ${run}`,
  );
  await expect(page.getByTestId('reveal-prose')).toContainText(
    `Prose gouvernée du RUN ${run}`,
  );
  await expect(page.getByTestId('reveal-sources')).toBeVisible();
}
