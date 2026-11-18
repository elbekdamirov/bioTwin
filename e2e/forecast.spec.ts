/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.addInitScript(()=>localStorage.setItem('biotwin-tour-v1','dismissed'));
});

test('chatbot forecasts a medicine on a real NHANES patient, updates the dashboard, body and export', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Start with a real diabetes patient'}).click();
  await expect(page.getByRole('heading',{name:'Type 2 diabetes',level:1})).toBeVisible();
  const dashboard = page.getByTestId('forecast-dashboard');
  await expect(dashboard).toContainText('NHANES 2017–2020');
  await expect(dashboard).toContainText('UKPDS 56');
  const weightBefore = await page.locator('.twin-viewport').getAttribute('data-weight-kg');

  await page.getByLabel('Ask about a medicine').fill('Add empagliflozin');
  await page.getByRole('button',{name:'Send'}).click();
  await expect(page.locator('.msg.bot').last()).toContainText('EMPA-REG OUTCOME');
  await expect(dashboard.getByRole('button',{name:'+ Empagliflozin'})).toBeVisible();
  const chd = dashboard.locator('[data-outcome=chd]');
  expect(Number(await chd.getAttribute('data-plan'))).toBeLessThan(Number(await chd.getAttribute('data-base')));

  await dashboard.getByLabel('Show body at year 5').check();
  await expect(page.locator('.twin-viewport')).not.toHaveAttribute('data-weight-kg', weightBefore!);
  await dashboard.getByRole('button',{name:/^Kidneys/}).click();
  await expect(page.getByRole('button',{name:'Abdomen',exact:true})).toHaveAttribute('aria-pressed','true');

  await page.getByRole('button',{name:'Reports',exact:true}).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button',{name:'Session & events JSON'}).click();
  const stream = await (await downloadEvent).createReadStream();
  const chunks: Buffer[] = [];
  for await (const part of stream!) chunks.push(Buffer.from(part));
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported.forecast.added).toEqual(['empagliflozin']);
  expect(exported.profile.clinical.source).toContain('NHANES');
  expect(exported.forecast.outcomes[0].withPlan5y).toBeLessThan(exported.forecast.outcomes[0].noChange5y);
});

test('compares medicines in Uzbek and blocks unsafe combinations', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'UZ'}).click();
  await page.getByRole('button',{name:'Haqiqiy diabet bemori bilan boshlash'}).click();
  await page.getByLabel('Dori haqida so‘rang').fill('Semaglutid va sitagliptinni taqqoslang');
  await page.getByRole('button',{name:'Yuborish'}).click();
  await expect(page.locator('.msg.bot').last()).toContainText('yonma-yon');
  await expect(page.locator('.compare-table')).toBeVisible();
  await page.getByLabel('Dori haqida so‘rang').fill('ramipril qo‘shing');
  await page.getByRole('button',{name:'Yuborish'}).click();
  await expect(page.locator('.msg.bot').last()).toContainText('⛔');
});

test('enter-your-own patient asks for measurements, then forecasts heart failure on a phone without overflow', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.getByRole('button',{name:'Enter my own patient',exact:true}).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Preset').selectOption('heart');
  await editor.getByRole('button',{name:'Create digital twin',exact:true}).click();
  await expect(page.getByTestId('forecast-dashboard')).toContainText('Missing measurements');
  await page.getByRole('button',{name:'Enter measurements'}).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Ejection fraction (%)').fill('30');
  await form.getByLabel('Systolic BP (mmHg)').fill('118');
  await form.getByLabel('Creatinine (µmol/L)').fill('110');
  await form.getByLabel('NYHA class').selectOption('2');
  await form.getByRole('button',{name:'Save measurements'}).click();
  await expect(page.getByTestId('forecast-dashboard').locator('[data-outcome=death]')).toBeVisible();
  await page.getByRole('button',{name:'Add bisoprolol'}).click();
  const death = page.getByTestId('forecast-dashboard').locator('[data-outcome=death]');
  expect(Number(await death.getAttribute('data-plan'))).toBeLessThan(Number(await death.getAttribute('data-base')));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
