/// <reference lib="dom" />
import {expect,test} from '@playwright/test';
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('biotwin-tour-v1','dismissed'));});

test('heart-failure drug acts only on B and records the measured response in the report',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:/BT-C02 Heart failure/}).click();
  await page.getByRole('button',{name:'Short-term test',exact:true}).click();
  await expect(page.locator('.medicine-card',{hasText:'Furosemide'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Create matched twin',exact:true}).click();
  await page.getByRole('button',{name:'Configure B',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Furosemide');
  await page.getByRole('button',{name:'Confirm and apply'}).click();
  await page.getByRole('button',{name:'Compare A / B',exact:true}).click();
  await page.getByRole('button',{name:'Run comparison · +5 min'}).click();
  await expect(page.locator('.branch-pair')).toContainText('05:05');
  await expect(page.locator('.inspector-panel')).toContainText('Urine output · B − A');
  await expect(page.locator('.comparison-value')).not.toContainText(/^0 /);
  await page.getByRole('button',{name:'Reports',exact:true}).click();
  await page.emulateMedia({media:'print'});
  await expect(page.locator('.report-print')).toContainText('Furosemide');
  await expect(page.locator('.report-print')).toContainText('Urine output');
  await page.emulateMedia({media:'screen'});
});

test('real-patient browser opens a UCI heart-failure twin and diabetes anatomy stays discoverable',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:/Browse .* real patients/}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Heart failure',exact:true}).click();
  await expect(dialog).toContainText('299 hospital patients');
  await dialog.getByRole('listitem').filter({hasText:'UCI-HF-085'}).click();
  await expect(page.getByRole('heading',{name:'Heart failure',level:1})).toBeVisible();
  await expect(page.getByTestId('forecast-dashboard')).toContainText('MAGGIC');
  await expect(page.locator('.canvas-wrap')).toHaveAttribute('data-stage','ready',{timeout:45000});
  await page.getByRole('button',{name:'Patient Library',exact:true}).click();
  await page.getByRole('button',{name:/BT-M01 Type 1 diabetes/}).click();
  const model=page.waitForResponse(r=>r.ok()&&r.url().endsWith('/digestive.glb'));
  await page.getByRole('button',{name:'Abdomen',exact:true}).click();
  await model;
  await expect(page.getByRole('button',{name:'Abdomen',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('recorded insulin allergy blocks application in both treatment entry points',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Enter my own patient',exact:true}).click();
  await page.getByLabel('Drug allergies · comma separated names').fill('insulin');
  await page.getByLabel('Current medicines and doses').fill('Synthetic medication record');
  await page.getByRole('button',{name:'Create digital twin',exact:true}).click();
  await page.getByRole('button',{name:'Short-term test',exact:true}).click();
  await expect(page.locator('.medicine-panel')).toContainText('matching drug allergy');
  await page.getByRole('button',{name:'Create matched twin',exact:true}).click();
  await expect(page.getByRole('button',{name:'Configure B',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Compare A / B',exact:true}).click();
  await page.getByRole('button',{name:'Configure B',exact:true}).click();
  await expect(page.getByRole('button',{name:'Confirm and apply'})).toBeDisabled();
});
