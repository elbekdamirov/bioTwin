/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

function silentWav() {
  const bytes = Buffer.alloc(44 + 48000);
  bytes.write('RIFF',0); bytes.writeUInt32LE(bytes.length-8,4); bytes.write('WAVEfmt ',8);
  bytes.writeUInt32LE(16,16); bytes.writeUInt16LE(1,20); bytes.writeUInt16LE(1,22);
  bytes.writeUInt32LE(24000,24); bytes.writeUInt32LE(48000,28); bytes.writeUInt16LE(2,32);
  bytes.writeUInt16LE(16,34); bytes.write('data',36); bytes.writeUInt32LE(48000,40);
  return bytes;
}

test('first visit, silent progression, patient gate, dismissal and replay', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/tour/audio', route => { requests.push(route.request().postData()!); return route.fulfill({status:200,contentType:'audio/wav',body:silentWav()}); });
  await page.goto('/');
  const guide = page.getByRole('dialog', {name:'Meet BioTwin'});
  await expect(guide).toBeVisible();
  expect(requests).toEqual([]);
  await guide.getByRole('button',{name:'Continue without sound'}).click();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByText('Open a patient from the library, then continue here.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Next',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:/BT-M01 Type 1 diabetes/}).click();
  await expect(page.locator('[data-stage=ready]')).toBeVisible({timeout:45000});
  await expect(page.getByRole('button',{name:'Next',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Close guide'}).click();
  await page.reload();
  await expect(page.locator('.voice-tour')).toHaveCount(0);
  await page.locator('[data-tour=guide]').click();
  await expect(page.getByRole('heading',{name:'Meet BioTwin'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-tour=guide]')).toBeFocused();
  expect(requests).toEqual([]);
});

test('voice click, pause/replay, immediate language switch and caption fallback', async ({ page }) => {
  const requests: {language:string;step:string}[] = [];
  await page.route('**/api/tour/audio', async route => {
    requests.push(route.request().postDataJSON() as {language:string;step:string});
    if (requests.length === 2) { await route.fulfill({status:403,json:{error:'Authorization unavailable'}}); return; }
    await route.fulfill({status:200,contentType:'audio/wav',body:silentWav()});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Start guided tour',exact:true}).click();
  await expect.poll(() => requests.length).toBe(1);
  await expect(page.locator('.tour-wave')).toHaveClass(/active/);
  await page.getByRole('button',{name:'Pause narration'}).click();
  await expect(page.locator('.tour-wave')).not.toHaveClass(/active/);
  await page.getByRole('button',{name:'Replay this step'}).click();
  await expect(page.locator('.tour-wave')).toHaveClass(/active/);
  await page.getByRole('button',{name:'O‘zbekcha',exact:true}).click();
  await expect(page.getByRole('heading',{name:'BioTwin bilan tanishing'})).toBeVisible();
  await expect(page.getByText('Ovozli yo‘riqnoma mavjud emas. Matn bilan davom eting.')).toBeVisible();
  expect(requests.at(-1)?.language).toBe('uz');
  await expect(page.locator('.tour-wave')).not.toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.voice-tour')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang','uz');
});

test('a rapid step change cancels obsolete audio and the phone guide fits', async ({page}) => {
  await page.setViewportSize({width:360,height:844});
  let aborted = false;
  await page.route('**/api/tour/audio',async route => {
    await new Promise(resolve=>setTimeout(resolve,500));
    try { await route.fulfill({status:200,contentType:'audio/wav',body:silentWav()}); } catch { aborted=true; }
  });
  page.on('requestfailed',request=> { if(request.url().includes('/api/tour/audio')) aborted=true; });
  await page.goto('/');
  await page.getByRole('button',{name:'Start guided tour',exact:true}).click();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.keyboard.press('Escape');
  await expect.poll(()=>aborted).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

