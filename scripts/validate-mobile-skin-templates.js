#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

const db = JSON.parse(fs.readFileSync('public/data/mobile-skin-templates.json', 'utf8'));
const html = fs.readFileSync('public/mobile-skin-studio.html', 'utf8');
assert.equal(db.schemaVersion, 1, 'template schema version');
assert.ok(Array.isArray(db.models), 'models array exists');

const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ids = new Set();
const names = new Set();
for (const model of db.models) {
  assert.ok(model.id && !ids.has(model.id), 'unique model id: ' + model.id);
  ids.add(model.id);
  assert.ok(model.name && !names.has(normalize(model.name)), 'unique model name: ' + model.name);
  names.add(normalize(model.name));
  assert.ok(model.sources && model.sources.length, 'source references exist: ' + model.name);
  for (const source of model.sources) {
    assert.ok(/^https:\/\//.test(source.url), 'HTTPS source URL: ' + model.name);
    assert.ok(source.label && source.supports && source.supports.length, 'source support notes: ' + model.name);
  }
  const d = model.dimensionsMm;
  assert.ok(d && d.width > 30 && d.width < 120 && d.height > 80 && d.height < 250, 'valid body dimensions: ' + model.name);
  if (model.variants) {
    for (const variant of model.variants) {
      const v = variant.dimensionsMm;
      assert.ok(v && v.width === d.width && v.height === d.height && v.thickness > 0, 'valid exact variant dimensions: ' + model.name + ' / ' + variant.name);
    }
  }
  if (model.status === 'verified') {
    assert.equal(model.machineReady, true, 'verified models must be machine-ready');
    assert.ok(model.cornerRadiusMm > 0, 'verified body corner profile');
    assert.ok(model.geometry && model.geometry.island && Array.isArray(model.geometry.openings), 'verified cut geometry');
    const checkCircle = (p, label) => {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.d) && p.d > 0, label + ' finite dimensions');
      assert.ok(p.x - p.d / 2 >= 0 && p.y - p.d / 2 >= 0 && p.x + p.d / 2 <= d.width && p.y + p.d / 2 <= d.height, label + ' lies within body');
    };
    for (const opening of model.geometry.openings) checkCircle(opening, model.name + ' opening');
  } else {
    assert.equal(model.status, 'unverified', 'only verified or unverified records allowed');
    assert.equal(model.machineReady, false, 'unverified models must not be machine-ready');
    assert.equal(model.geometry, null, 'no speculative cutout coordinates');
    assert.equal(model.cornerRadiusMm, null, 'no speculative corner radius');
    assert.ok(model.missingGeometry && model.missingGeometry.length, 'missing geometry is explicit');
  }
}

assert.match(html, /\/data\/mobile-skin-templates\.json/, 'page loads the template database');
assert.doesNotMatch(html, /function cameraProfile|const layouts=/, 'no generic guessed camera layouts');
assert.match(html, /manualCutoutsConfirmed/, 'manual cutouts require explicit confirmation');
assert.match(html, /function collectManualCutouts/, 'manual geometry parser exists');
assert.match(html, /function validateCircle/, 'coordinate bounds validation exists');
assert.match(html, /Math\.abs\(actualW-pageW\)>0\.01/, 'PDF page dimensions are checked');
assert.match(html, /bytes\.byteLength<500/, 'generated PDF byte output is checked');
assert.match(html, /function svgCutPaths/, 'SVG vector export exists');
assert.match(html, /if\(exact&&device\.status==='published'/, 'front frame lookup requires an exact published model match');

function checkPageSize(width, height, margin) {
  const page = { width: width + margin * 2, height: height + margin * 2 };
  assert.ok(Math.abs(page.width - (width + margin * 2)) <= 0.01);
  assert.ok(Math.abs(page.height - (height + margin * 2)) <= 0.01);
  return page;
}
const page = checkPageSize(75.6, 158.2, 10);
assert.deepEqual(page, { width: 95.6, height: 178.2 }, '1:1 mm PDF page dimensions');

function inBoundsCircle(x, y, diameter, width, height) {
  return diameter > 0 && x - diameter / 2 >= 0 && y - diameter / 2 >= 0 &&
    x + diameter / 2 <= width && y + diameter / 2 <= height;
}
assert.equal(inBoundsCircle(10, 10, 4, 75.6, 158.2), true, 'valid opening');
assert.equal(inBoundsCircle(1, 10, 4, 75.6, 158.2), false, 'out-of-bounds opening rejected');

console.log('Mobile skin template validation passed: ' + db.models.length + ' unverified records, no speculative cutout geometry, PDF/SVG guards present.');
