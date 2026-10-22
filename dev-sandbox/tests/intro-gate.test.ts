import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTRO_SEEN_KEY, introRequested, markIntroSeen, shouldPlayIntro } from '../src/core/intro-timeline';
import { planIntro } from '../src/demo/intro-gate';

// Defect: the intro was unreachable. The 'seen' flag survives a cache clear, and the start condition
// refused to play the walk-in whenever the saved room had the tutorial finished - even for ?intro.

const fake = () => {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v; },
  };
};

test('an explicit request is recognised from the query string', () => {
  assert.equal(introRequested('?intro'), true);
  assert.equal(introRequested('?intro=1'), true);
  assert.equal(introRequested('?foo=1&intro'), true);
  assert.equal(introRequested(''), false);
  assert.equal(introRequested('?foo=1'), false);
});

test('?intro plays the intro even when the flag says it was already seen', () => {
  const s = fake();
  markIntroSeen(s);
  assert.equal(shouldPlayIntro(s, '?intro'), true);
  assert.equal(shouldPlayIntro(s, '?intro', { hasSavedRoom: true }), true);
});

test('no saved demo room counts as a first visit even with a stale seen flag', () => {
  const s = fake();
  markIntroSeen(s);
  assert.equal(s.data[INTRO_SEEN_KEY], '1');
  assert.equal(shouldPlayIntro(s, '', { hasSavedRoom: false }), true, 'a real data clear restores the intro');
  assert.equal(shouldPlayIntro(s, '', { hasSavedRoom: true }), false, 'a returning visitor who kept their room is left alone');
});

test('a first visit still plays, and a returning visitor is not nagged on every load', () => {
  const s = fake();
  assert.equal(shouldPlayIntro(s, '', { hasSavedRoom: false }), true);
  markIntroSeen(s);
  assert.equal(shouldPlayIntro(s, '', { hasSavedRoom: true }), false);
  assert.equal(shouldPlayIntro(s, '?foo=1', { hasSavedRoom: true }), false);
  // Unknown room state keeps the old flag-only behaviour.
  assert.equal(shouldPlayIntro(s, ''), false);
  assert.equal(shouldPlayIntro(null, ''), true);
});

test('an explicit request always plays the walk-in and always resets intro objects to the tray', () => {
  assert.deepEqual(planIntro({ explicit: true, introAllowed: true, tutorialDone: true }), { playIntro: true, reseed: true });
  assert.deepEqual(planIntro({ explicit: true, introAllowed: false, tutorialDone: true }), { playIntro: true, reseed: true },
    'the explicit path does not depend on the seen flag');
  assert.deepEqual(planIntro({ explicit: true, introAllowed: true, tutorialDone: false }), { playIntro: true, reseed: true },
    'explicit replay should always reset the starter objects to their intro tray slots');
});

test('without an explicit request the intro only plays for an unfinished room', () => {
  assert.deepEqual(planIntro({ explicit: false, introAllowed: true, tutorialDone: false }), { playIntro: true, reseed: false });
  assert.deepEqual(planIntro({ explicit: false, introAllowed: true, tutorialDone: true }), { playIntro: false, reseed: false },
    'a finished room is never silently reset on an ordinary load');
  assert.deepEqual(planIntro({ explicit: false, introAllowed: false, tutorialDone: false }), { playIntro: false, reseed: false });
});

test('the plan never reseeds a room it is not about to walk into', () => {
  for (const explicit of [true, false]) {
    for (const introAllowed of [true, false]) {
      for (const tutorialDone of [true, false]) {
        const plan = planIntro({ explicit, introAllowed, tutorialDone });
        if (plan.reseed) assert.ok(plan.playIntro, 'a reseed always comes with the walk-in');
      }
    }
  }
});
