// One-shot generator for rooms/omari.json: every cozy-loft slot gets a spoon.
import { writeFileSync } from 'node:fs';
import { getLayout, DEFAULT_LAYOUT_ID } from '../src/core/layout';
import type { RoomState } from '../src/core/types';

const MATRIX_URL = 'https://www.youtube.com/watch?v=XO0pcWxcROI';
const HIDDEN_SLOT = 'floor-10';

const QUOTES: [string, string, string][] = [
  ['unexamined-life', 'The unexamined life is not worth living.', 'Socrates, in Plato\u2019s Apology'],
  ['how-to-live', 'We are discussing no small matter, but how we ought to live.', 'Socrates, in Plato\u2019s Republic'],
  ['moving-image', 'Time is the moving image of eternity.', 'Plato, Timaeus'],
  ['political-animal', 'Man is by nature a political animal.', 'Aristotle, Politics'],
  ['soul-image', 'The soul never thinks without an image.', 'Aristotle, On the Soul'],
  ['excellence-habit', 'We are what we repeatedly do. Excellence, then, is not an act but a habit.', 'Will Durant, The Story of Philosophy'],
  ['cogito', 'I think, therefore I am.', 'Ren\u00e9 Descartes, Discourse on the Method'],
  ['condemned-free', 'Man is condemned to be free.', 'Jean-Paul Sartre, Being and Nothingness'],
  ['existence-essence', 'Existence precedes essence.', 'Jean-Paul Sartre, Existentialism Is a Humanism'],
  ['sisyphus', 'One must imagine Sisyphus happy.', 'Albert Camus, The Myth of Sisyphus'],
  ['why-to-live', 'He who has a why to live can bear almost any how.', 'Friedrich Nietzsche, Twilight of the Idols'],
  ['god-is-dead', 'God is dead. God remains dead. And we have killed him.', 'Friedrich Nietzsche, The Gay Science'],
  ['silence', 'Whereof one cannot speak, thereof one must be silent.', 'Ludwig Wittgenstein, Tractatus Logico-Philosophicus'],
  ['limits-language', 'The limits of my language mean the limits of my world.', 'Ludwig Wittgenstein, Tractatus Logico-Philosophicus'],
  ['born-free', 'Man is born free, and everywhere he is in chains.', 'Jean-Jacques Rousseau, The Social Contract'],
  ['starry-heavens', 'Two things fill the mind with ever-increasing wonder and awe: the starry heavens above me and the moral law within me.', 'Immanuel Kant, Critique of Practical Reason'],
  ['universal-law', 'Act only according to that maxim whereby you can at the same time will that it should become a universal law.', 'Immanuel Kant, Groundwork of the Metaphysics of Morals'],
  ['oyster', 'The life of a man is of no greater importance to the universe than that of an oyster.', 'David Hume, Of Suicide'],
  ['slave-passions', 'Reason is, and ought only to be, the slave of the passions.', 'David Hume, A Treatise of Human Nature'],
  ['nature-hides', 'Nature loves to hide.', 'Heraclitus, Fragment 123'],
  ['tao', 'The Tao that can be told is not the eternal Tao.', 'Laozi, Tao Te Ching'],
  ['impermanence', 'All conditioned things are impermanent.', 'the Buddha, Dhammapada'],
  ['power-over-mind', 'You have power over your mind \u2013 not outside events. Realize this, and you will find strength.', 'Marcus Aurelius, Meditations'],
  ['as-it-should', 'Whatever happens at all happens as it should; you will find this true if you watch narrowly.', 'Marcus Aurelius, Meditations'],
  ['opinions-of-things', 'It is not things that disturb us, but our opinions about things.', 'Epictetus, Enchiridion'],
  ['imagination-suffering', 'We suffer more often in imagination than in reality.', 'Seneca, Letters to Lucilius'],
  ['keep-learning', 'As long as you live, keep learning how to live.', 'Seneca, Letters to Lucilius'],
  ['measure-of-things', 'Man is the measure of all things.', 'Protagoras'],
  ['heart-reasons', 'The heart has its reasons, of which reason knows nothing.', 'Blaise Pascal, Pens\u00e9es'],
  ['quiet-room', 'All of humanity\u2019s problems stem from man\u2019s inability to sit quietly in a room alone.', 'Blaise Pascal, Pens\u00e9es'],
  ['owl-of-minerva', 'The owl of Minerva spreads its wings only with the falling of the dusk.', 'G. W. F. Hegel, Philosophy of Right'],
  ['rational-actual', 'What is rational is actual, and what is actual is rational.', 'G. W. F. Hegel, Philosophy of Right'],
  ['backwards', 'Life can only be understood backwards; but it must be lived forwards.', 'S\u00f8ren Kierkegaard, Journals'],
  ['dizziness', 'Anxiety is the dizziness of freedom.', 'S\u00f8ren Kierkegaard, The Concept of Anxiety'],
  ['change-the-world', 'Philosophers have hitherto only interpreted the world; the point is to change it.', 'Karl Marx, Theses on Feuerbach'],
  ['representation', 'The world is my representation.', 'Arthur Schopenhauer, The World as Will and Representation'],
  ['pendulum', 'Life swings like a pendulum backward and forward between pain and boredom.', 'Arthur Schopenhauer, Essays and Aphorisms'],
  ['esse-percipi', 'To be is to be perceived.', 'George Berkeley, A Treatise Concerning the Principles of Human Knowledge'],
  ['house-of-being', 'Language is the house of being.', 'Martin Heidegger, Letter on Humanism'],
  ['becomes-woman', 'One is not born, but rather becomes, a woman.', 'Simone de Beauvoir, The Second Sex'],
  ['power-resistance', 'Where there is power, there is resistance.', 'Michel Foucault, The History of Sexuality'],
  ['outside-the-text', 'There is nothing outside the text.', 'Jacques Derrida, Of Grammatology'],
  ['certainty-absurd', 'Doubt is not a pleasant condition, but certainty is absurd.', 'Voltaire, letter to Frederick II of Prussia'],
  ['absurdities', 'Those who can make you believe absurdities can make you commit atrocities.', 'Voltaire, Questions sur les miracles'],
  ['greatest-happiness', 'It is the greatest happiness of the greatest number that is the measure of right and wrong.', 'Jeremy Bentham, A Fragment on Government'],
  ['dissatisfied-human', 'It is better to be a human being dissatisfied than a pig satisfied.', 'John Stuart Mill, Utilitarianism'],
  ['knowledge-power', 'Knowledge itself is power.', 'Francis Bacon, Meditationes Sacrae'],
  ['map-territory', 'A map is not the territory it represents.', 'Alfred Korzybski, Science and Sanity'],
  ['body-medium', 'The body is our general medium for having a world.', 'Maurice Merleau-Ponty, Phenomenology of Perception'],
];

const layout = getLayout(DEFAULT_LAYOUT_ID)!;
const slots = layout.slots.map((s) => s.id);
const hiddenIndex = slots.indexOf(HIDDEN_SLOT);
if (hiddenIndex < 0) throw new Error(`hidden slot ${HIDDEN_SLOT} is not in the layout`);
const quotesNeeded = slots.length - 1;
if (QUOTES.length < quotesNeeded) throw new Error(`need ${quotesNeeded} quotes, have ${QUOTES.length}`);
const quotes = QUOTES.slice(0, quotesNeeded);

const room: RoomState = {
  schemaVersion: 1,
  id: 'omari',
  owner: 'Omari\u2019s room',
  layoutId: layout.id,
  contentItems: [],
  representations: [],
  placements: [],
};

const createdAt = '2026-10-21T00:00:00.000Z';
let q = 0;
for (const slotId of slots) {
  const hidden = slotId === HIDDEN_SLOT;
  const id = hidden ? 'omari-spoon-no-spoon' : `omari-spoon-${quotes[q][0]}`;
  if (hidden) {
    room.contentItems.push({
      id,
      type: 'video',
      title: 'Spoon',
      sourceKind: 'url',
      sourceRef: MATRIX_URL,
      notes: 'There is no spoon',
      tags: ['spoon', 'omari', 'matrix'],
      createdAt,
    });
  } else {
    const [, text, author] = quotes[q];
    room.contentItems.push({
      id,
      type: 'note',
      title: 'Spoon',
      sourceKind: 'note',
      sourceRef: text,
      notes: `\u201c${text}\u201d \u2014 ${author}`,
      tags: ['spoon', 'omari', 'philosophy'],
      createdAt,
    });
    q++;
  }
  const repId = `${id}-rep`;
  room.representations.push({ id: repId, contentItemId: id, objectKind: 'spoon' });
  room.placements.push({ representationId: repId, slotId });
}

writeFileSync(`${process.cwd()}/rooms/omari.json`, `${JSON.stringify(room, null, 2)}\n`);
console.log(`slots=${slots.length} items=${room.contentItems.length} hidden=${HIDDEN_SLOT} contentIndex=${hiddenIndex}`);
