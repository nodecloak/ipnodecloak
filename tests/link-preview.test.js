// Sharing metadata uses a compact existing thumbnail instead of the installable app's large icon.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('link previews request a summary card with an accurate small PNG thumbnail',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const content=key=>new RegExp(`<meta (?:property|name)="${key}" content="([^"]+)"`).exec(html)?.[1];
  assert.equal(content('twitter:card'),'summary');
  const image=content('og:image');
  assert.equal(image,'__SITE_URL__/brand/ipnodecloak-app-icon-180.png');
  assert.equal(content('twitter:image'),image);
  const png=readFileSync(new URL('../public/brand/ipnodecloak-app-icon-180.png',import.meta.url));
  assert.equal(png.subarray(1,4).toString(),'PNG');
  assert.equal(Number(content('og:image:width')),png.readUInt32BE(16));
  assert.equal(Number(content('og:image:height')),png.readUInt32BE(20));
  assert.match(html,/rel="apple-touch-icon" href="\/brand\/ipnodecloak-app-icon-180.png"/);
});
